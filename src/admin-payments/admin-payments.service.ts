import {Inject, Injectable} from '@nestjs/common';
import {Prisma, User} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.js';
import {OwnershipService} from '../platform/ownership.service.js';
import {StorageService} from '../platform/storage.service.js';
import {JobsService} from '../platform/jobs.service.js';
import {PageDto, paging, listed, fail} from '../platform/common.js';
import {serial} from '../platform/transaction.js';
import {PaymentQuery, RejectDto, PaymentMethodDto, UpdateMethodDto, PromoDto, UpdatePromoDto} from '../payments/payments.dto.js';
@Injectable()
export class AdminPaymentsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(OwnershipService) private readonly scope: OwnershipService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}
  async list(user: User, q: PaymentQuery) {
    const where = {
      course: this.scope.filter(user),
      status: q.status,
      courseId: q.courseId,
    };
    const [data, total] = await this.db.$transaction([
      this.db.payment.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { title: true, currency: true } },
          user: { select: { id: true, displayName: true } },
        },
      }),
      this.db.payment.count({ where }),
    ]);
    return listed(
      data.map(({ slipUrl, ...p }) => ({ ...p, hasSlip: !!slipUrl })),
      total,
      q,
    );
  }
  async detail(user: User, id: string) {
    await this.scope.check(user, 'payment', id);
    const p = await this.db.payment.findUniqueOrThrow({
      where: { id },
      include: {
        paymentMethod: true,
        course: true,
        user: { select: { id: true, displayName: true } },
      },
    });
    return {
      ...p,
      slipUrl: p.slipUrl ? await this.storage.get('SLIPS', p.slipUrl) : null,
    };
  }
  async approve(user: User, id: string) {
    await this.scope.check(user, 'payment', id);
    const payment = await serial(this.db, async (tx) => {
      const p = await tx.payment.findUniqueOrThrow({
        where: { id },
        include: { promoCode: true, course: true },
      });
      if (p.status !== 'slip_uploaded')
        fail(
          409,
          'INVALID_PAYMENT_STATE',
          'Only uploaded slips may be approved',
        );
      if (user.role !== 'super_admin' && p.course.ownerId !== user.id)
        fail(404, 'NOT_FOUND', 'Payment not found');
      if (p.promoCode) {
        const promo = p.promoCode;
        if (promo.maxUses !== null && promo.usedCount >= promo.maxUses)
          fail(409, 'PROMO_EXHAUSTED', 'Promo code usage limit reached');
        await tx.promoCode.update({
          where: { id: promo.id },
          data: { usedCount: { increment: 1 } },
        });
      }
      const updated = await tx.payment.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedById: user.id,
          reviewedAt: new Date(),
          rejectReason: null,
        },
      });
      await tx.enrollment.upsert({
        where: { userId_courseId: { userId: p.userId, courseId: p.courseId } },
        create: { userId: p.userId, courseId: p.courseId, accessType: 'paid' },
        update: {},
      });
      const channel = await tx.channel.upsert({
        where: { courseId: p.courseId },
        create: { courseId: p.courseId, name: p.course.title },
        update: {},
      });
      await tx.channelMember.upsert({
        where: {
          channelId_userId: { channelId: channel.id, userId: p.userId },
        },
        create: { channelId: channel.id, userId: p.userId },
        update: {},
      });
      return updated;
    });
    await this.jobs.add(
      'payment-approved',
      {
        userId: payment.userId,
        courseId: payment.courseId,
        paymentId: payment.id,
      },
      `payment-${id}`,
    );
    return { ...payment, slipUrl: undefined };
  }
  async reject(user: User, id: string, dto: RejectDto) {
    await this.scope.check(user, 'payment', id);
    const r = await this.db.payment.updateMany({
      where: { id, status: 'slip_uploaded' },
      data: {
        status: 'rejected',
        rejectReason: dto.rejectReason,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
    if (!r.count)
      fail(409, 'INVALID_PAYMENT_STATE', 'Only uploaded slips may be rejected');
    return this.detail(user, id);
  }
  async methods(q: PageDto) {
    const [data, total] = await this.db.$transaction([
      this.db.paymentMethod.findMany({
        ...paging(q),
        orderBy: { name: 'asc' },
      }),
      this.db.paymentMethod.count(),
    ]);
    return listed(data, total, q);
  }
  createMethod(dto: PaymentMethodDto) {
    return this.db.paymentMethod.create({ data: dto });
  }
  updateMethod(id: string, dto: UpdateMethodDto) {
    return this.db.paymentMethod.update({ where: { id }, data: dto });
  }
  deleteMethod(id: string) {
    return this.db.paymentMethod.delete({ where: { id } });
  }
  async promos(user: User, q: PageDto) {
    const where =
      user.role === 'super_admin' ? {} : { course: this.scope.filter(user) };
    const [data, total] = await this.db.$transaction([
      this.db.promoCode.findMany({
        where,
        ...paging(q),
        orderBy: { code: 'asc' },
      }),
      this.db.promoCode.count({ where }),
    ]);
    return listed(data, total, q);
  }
  private async promoScope(user: User, id: string) {
    const p = await this.db.promoCode.findUniqueOrThrow({ where: { id } });
    if (p.courseId) await this.scope.check(user, 'course', p.courseId);
    else if (user.role !== 'super_admin')
      fail(404, 'NOT_FOUND', 'Promo not found');
    return p;
  }
  private async validatePromo(
    user: User,
    dto: {
      courseId?: string | null;
      discountType: string;
      discountValue: Prisma.Decimal | string;
      validFrom?: Date | string | null;
      validTo?: Date | string | null;
    },
  ) {
    if (dto.courseId) await this.scope.check(user, 'course', dto.courseId);
    else if (user.role !== 'super_admin')
      fail(
        403,
        'GLOBAL_PROMO_FORBIDDEN',
        'Only super admins can create global promos',
      );
    if (
      new Prisma.Decimal(dto.discountValue).lt(0) ||
      (dto.discountType === 'percent' &&
        new Prisma.Decimal(dto.discountValue).gt(100))
    )
      fail(
        400,
        'INVALID_DISCOUNT',
        'Discount must be nonnegative and percent cannot exceed 100',
      );
    if (
      dto.validFrom &&
      dto.validTo &&
      new Date(dto.validFrom) > new Date(dto.validTo)
    )
      fail(400, 'INVALID_DATES', 'validFrom must not exceed validTo');
  }
  async createPromo(user: User, dto: PromoDto) {
    await this.validatePromo(user, dto);
    return this.db.promoCode.create({ data: dto });
  }
  async updatePromo(user: User, id: string, dto: UpdatePromoDto) {
    const old = await this.promoScope(user, id);
    await this.validatePromo(user, { ...old, ...dto });
    if (
      dto.maxUses !== undefined &&
      dto.maxUses !== null &&
      dto.maxUses < old.usedCount
    )
      fail(400, 'INVALID_LIMIT', 'maxUses cannot be less than usedCount');
    return this.db.promoCode.update({ where: { id }, data: dto });
  }
  async deletePromo(user: User, id: string) {
    await this.promoScope(user, id);
    return this.db.promoCode.delete({ where: { id } });
  }
}
