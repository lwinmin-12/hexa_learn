import {Inject, Injectable} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service.js';
import {StorageService} from '../platform/storage.service.js';
import {LearningAccessService} from '../courses/access.service.js';
import {PageDto, paging, listed, fail} from '../platform/common.js';
import {imageFile} from '../platform/uploads.js';
import {serial} from '../platform/transaction.js';
import {PaymentDto, PromoPreviewDto} from './payments.dto.js';
export function discount(
  amount: Prisma.Decimal,
  type: 'percent' | 'fixed',
  value: Prisma.Decimal,
) {
  return Prisma.Decimal.min(
    amount,
    type === 'percent' ? amount.mul(value).div(100) : value,
  ).toDecimalPlaces(2);
}
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(LearningAccessService)
    private readonly access: LearningAccessService,
  ) {}
  async price(tx: Prisma.TransactionClient, courseId: string, code?: string) {
    const course = await tx.course.findUniqueOrThrow({
      where: { id: courseId },
    });
    if (!course.isPremium || !course.price)
      fail(400, 'FREE_COURSE', 'Use free enrollment for this course');
    const amount = course.price;
    let discountAmount = new Prisma.Decimal(0),
      promoCodeId: string | undefined;
    if (code) {
      const promo = await tx.promoCode.findUnique({ where: { code } });
      const now = new Date();
      if (
        !promo ||
        !promo.isActive ||
        (promo.validFrom && promo.validFrom > now) ||
        (promo.validTo && promo.validTo < now) ||
        (promo.maxUses !== null && promo.usedCount >= promo.maxUses) ||
        (promo.courseId && promo.courseId !== courseId)
      )
        fail(400, 'INVALID_PROMO', 'Promo code is unavailable');
      discountAmount = discount(
        amount,
        promo.discountType,
        promo.discountValue,
      );
      promoCodeId = promo.id;
    }
    return {
      amount,
      discountAmount,
      finalAmount: amount.minus(discountAmount),
      promoCodeId,
    };
  }
  async preview(dto: PromoPreviewDto) {
    await this.access.course(dto.courseId);
    return this.price(this.db, dto.courseId, dto.code);
  }
  async create(userId: string, dto: PaymentDto) {
    await this.access.course(dto.courseId);
    return serial(this.db, async (tx) => {
      if (
        await tx.enrollment.findUnique({
          where: { userId_courseId: { userId, courseId: dto.courseId } },
        })
      )
        fail(409, 'ALREADY_ENROLLED', 'Already enrolled');
      if (
        !(await tx.paymentMethod.findFirst({
          where: { id: dto.paymentMethodId, isActive: true },
        }))
      )
        fail(400, 'INVALID_PAYMENT_METHOD', 'Payment method is unavailable');
      const amounts = await this.price(tx, dto.courseId, dto.promoCode);
      return tx.payment.create({
        data: {
          userId,
          courseId: dto.courseId,
          paymentMethodId: dto.paymentMethodId,
          ...amounts,
        },
      });
    });
  }
  async methods(q: PageDto) {
    const where = { isActive: true };
    const [data, total] = await this.db.$transaction([
      this.db.paymentMethod.findMany({
        where,
        ...paging(q),
        orderBy: { name: 'asc' },
      }),
      this.db.paymentMethod.count({ where }),
    ]);
    return listed(data, total, q);
  }
  async detail(userId: string, id: string) {
    const p = await this.db.payment.findFirst({
      where: { id, userId },
      include: {
        paymentMethod: true,
        course: { select: { title: true, currency: true } },
      },
    });
    if (!p) fail(404, 'NOT_FOUND', 'Payment not found');
    return {
      ...p,
      slipUrl: p.slipUrl ? await this.storage.get('SLIPS', p.slipUrl) : null,
    };
  }
  async mine(userId: string, q: PageDto) {
    const where = { userId };
    const [data, total] = await this.db.$transaction([
      this.db.payment.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
        include: { course: { select: { title: true, currency: true } } },
      }),
      this.db.payment.count({ where }),
    ]);
    return listed(
      data.map(({ slipUrl, ...p }) => ({ ...p, hasSlip: !!slipUrl })),
      total,
      q,
    );
  }
  async slip(userId: string, id: string, file: Express.Multer.File) {
    const p = await this.db.payment.findFirst({ where: { id, userId } });
    if (!p) fail(404, 'NOT_FOUND', 'Payment not found');
    if (!['pending', 'rejected'].includes(p.status))
      fail(409, 'INVALID_PAYMENT_STATE', 'Cannot replace this slip');
    const image = imageFile(file);
    const key = `payments/${id}/${randomUUID()}.${image.ext}`;
    await this.storage.put('SLIPS', key, image.buffer, image.contentType);
    const result = await this.db.payment.updateMany({
      where: { id, userId, status: { in: ['pending', 'rejected'] } },
      data: {
        slipUrl: key,
        status: 'slip_uploaded',
        rejectReason: null,
        reviewedAt: null,
        reviewedById: null,
      },
    });
    if (!result.count) {
      await this.storage.delete('SLIPS', key);
      fail(409, 'INVALID_PAYMENT_STATE', 'Payment changed during upload');
    }
    return this.detail(userId, id);
  }
}
