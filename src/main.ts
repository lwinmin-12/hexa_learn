import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { createValidationPipe } from './validation.js';
import { ApiErrorFilter } from './platform/common.js';
import { setupApiDocs } from './api-docs.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiErrorFilter());
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
  setupApiDocs(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
