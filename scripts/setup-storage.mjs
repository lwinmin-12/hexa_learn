import 'dotenv/config';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
  GetBucketPolicyCommand,
  GetBucketAclCommand,
} from '@aws-sdk/client-s3';

if (!process.env.S3_ENDPOINT)
  throw new Error('Set S3_ENDPOINT before provisioning S3-compatible storage');
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
});
try {
  for (const type of ['VIDEOS', 'MEDIA', 'SLIPS', 'BOOKS']) {
    const Bucket = process.env[`S3_BUCKET_${type}`];
    if (!Bucket)
      throw Object.assign(new Error(`S3_BUCKET_${type} is required; add it to .env`), {
        name: 'StorageConfigurationError',
      });
    try {
      await client.send(new HeadBucketCommand({ Bucket }));
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 404) throw error;
      await client.send(new CreateBucketCommand({ Bucket }));
    }
    if (type === 'BOOKS') {
      const acl = await client.send(new GetBucketAclCommand({ Bucket }));
      if (
        acl.Grants?.some(
          ({ Grantee }) =>
            Grantee?.URI?.endsWith('/AllUsers') ||
            Grantee?.URI?.endsWith('/AuthenticatedUsers'),
        )
      )
        throw Object.assign(new Error('BOOKS bucket has a public ACL'), {
          name: 'BooksBucketPublicAcl',
        });
      try {
        const { Policy } = await client.send(
          new GetBucketPolicyCommand({ Bucket }),
        );
        const policy = JSON.parse(Policy ?? '{}');
        const statements = Array.isArray(policy.Statement)
          ? policy.Statement
          : [policy.Statement];
        if (
          statements.some(
            (statement) =>
              statement?.Effect === 'Allow' &&
              (statement.Principal === '*' ||
                Object.values(statement.Principal ?? {})
                  .flat()
                  .includes('*')),
          )
        )
          throw Object.assign(new Error('BOOKS bucket has a public policy'), {
            name: 'BooksBucketPublicPolicy',
          });
      } catch (error) {
        if (error.name !== 'NoSuchBucketPolicy') throw error;
      }
    }
    console.log(`${type} bucket ready`);
    const origins = (
      process.env.S3_CORS_ORIGINS ?? process.env.DASHBOARD_ORIGINS
    )
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (origins?.length) {
      // Some MinIO versions manage CORS server-wide rather than per bucket.
      try {
        await client.send(
          new PutBucketCorsCommand({
            Bucket,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedOrigins: origins,
                  AllowedMethods: ['GET', 'HEAD', 'PUT'],
                  AllowedHeaders: ['*'],
                  ExposeHeaders: [
                    'ETag',
                    'Accept-Ranges',
                    'Content-Range',
                    'Content-Length',
                  ],
                  MaxAgeSeconds: 3600,
                },
              ],
            },
          }),
        );
      } catch (error) {
        if (error.$metadata?.httpStatusCode !== 501) throw error;
        console.log(
          'Configure MINIO_API_CORS_ALLOW_ORIGIN on the MinIO server for these browser origins',
        );
      }
    }
  }
} catch (error) {
  console.error(
    'Storage setup failed:',
    error.name === 'StorageConfigurationError' ? error.message : error.name ?? 'Error',
    error.$metadata?.httpStatusCode ??
      'Check endpoint, credentials and service availability',
  );
  process.exitCode = 1;
} finally {
  client.destroy();
}
