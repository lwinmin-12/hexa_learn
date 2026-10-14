import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

export function setupApiDocs(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Hexa Learn API')
    .setDescription(
      'Hexa Learn learning platform API at /api/v1. Use a Firebase ID token. Learning routes require a verified phone.',
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Firebase ID token',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    ui: false,
    raw: ['json'],
    jsonDocumentUrl: '/openapi.json',
  });
  app.use('/docs', apiReference({ url: '/openapi.json' }));
}
