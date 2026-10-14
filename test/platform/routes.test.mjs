import 'reflect-metadata';
import 'dotenv/config';
import { it, expect } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../../dist/app.module.js';
import { FirebaseAdminService } from '../../dist/firebase-admin/firebase-admin.service.js';
import { AccountDeletionService } from '../../dist/auth/account-deletion.service.js';
import { JobsService } from '../../dist/platform/jobs.service.js';
import { WorkerService } from '../../dist/platform/worker.service.js';
import { PublishingService } from '../../dist/platform/publishing.service.js';
it('registers every requested route and documents authentication and request bodies', async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FirebaseAdminService)
    .useValue({})
    .overrideProvider(AccountDeletionService)
    .useValue({})
    .overrideProvider(JobsService)
    .useValue({})
    .overrideProvider(WorkerService)
    .useValue({})
    .overrideProvider(PublishingService)
    .useValue({})
    .compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
  try {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const routes = JSON.parse(
      await readFile(new URL('./routes.json', import.meta.url), 'utf8'),
    );
    for (const [method, path] of routes) {
      const key = '/api/v1' + path.replace(/:(\w+)/g, '{$1}');
      const operation = doc.paths[key]?.[method.toLowerCase()];
      expect({ route: `${method} ${key}`, exists: !!operation }).toEqual({
        route: `${method} ${key}`,
        exists: true,
      });
      expect(operation.summary).toBeTruthy();
      if (!path.startsWith('/certificates/verify'))
        expect(operation.security).toContainEqual({ bearer: [] });
    }
    expect(doc.components.schemas.PaymentDto.properties.courseId).toBeDefined();
  } finally {
    await app.close();
  }
});
