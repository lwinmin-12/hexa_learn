import {Module} from '@nestjs/common';
import {CertificatesController, CertificateVerificationController} from './certificates.controller.js';
import {CertificatesService} from './certificates.service.js';
import {CertificatePdfService} from './certificate-pdf.service.js';
@Module({
  imports: [],
  controllers: [CertificateVerificationController, CertificatesController],
  providers: [CertificatesService, CertificatePdfService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
