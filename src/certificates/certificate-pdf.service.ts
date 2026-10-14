import {Injectable, NotImplementedException} from '@nestjs/common';
import type { Certificate } from '@prisma/client';
@Injectable()
export class CertificatePdfService {
  async generate(_certificate: Certificate): Promise<string> {
    // TODO: render the approved certificate design, upload to media storage, and return its stored URL.
    throw new NotImplementedException(
      'Certificate PDF generation is not configured',
    );
  }
}
