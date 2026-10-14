import {Inject, Injectable, NotImplementedException} from '@nestjs/common';
import {randomBytes} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service.js';
import {PageDto, paging, listed, fail} from '../platform/common.js';
import {serial} from '../platform/transaction.js';
import {CertificatePdfService} from './certificate-pdf.service.js';
@Injectable()
export class CertificatesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(CertificatePdfService) private readonly pdf: CertificatePdfService,
  ) {}
  async list(userId: string, q: PageDto) {
    const where = { userId };
    const [data, total] = await this.db.$transaction([
      this.db.certificate.findMany({
        where,
        ...paging(q),
        orderBy: { issuedAt: 'desc' },
        include: { course: { select: { title: true } } },
      }),
      this.db.certificate.count({ where }),
    ]);
    return listed(data, total, q);
  }
  async detail(userId: string, id: string) {
    return (
      (await this.db.certificate.findFirst({
        where: { id, userId },
        include: { course: { select: { title: true } } },
      })) ?? fail(404, 'NOT_FOUND', 'Certificate not found')
    );
  }
  async verify(no: string) {
    const c = await this.db.certificate.findUnique({
      where: { certificateNo: no },
      select: {
        issuedAt: true,
        user: { select: { displayName: true } },
        course: { select: { title: true } },
      },
    });
    if (!c) fail(404, 'NOT_FOUND', 'Certificate not found');
    return {
      learnerDisplayName: c.user.displayName,
      courseTitle: c.course.title,
      issuedAt: c.issuedAt,
      valid: true,
    };
  }
  async claim(userId: string, courseId: string) {
    const certificate = await serial(this.db, async (tx) => {
      const e = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });
      if (e?.status !== 'completed')
        fail(403, 'COURSE_INCOMPLETE', 'Complete the course first');
      return tx.certificate.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: {
          userId,
          courseId,
          certificateNo: `HEXA-${new Date().getUTCFullYear()}-${randomBytes(3).toString('hex').toUpperCase()}`,
        },
        update: {},
      });
    });
    if (certificate.pdfUrl) return certificate;
    try {
      const pdfUrl = await this.pdf.generate(certificate);
      return await this.db.certificate.update({
        where: { id: certificate.id },
        data: { pdfUrl },
      });
    } catch (e) {
      if (e instanceof NotImplementedException)
        return { ...certificate, pdfPending: true };
      throw e;
    }
  }
}
