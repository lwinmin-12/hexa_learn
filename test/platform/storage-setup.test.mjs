import { afterEach, expect, it, jest } from '@jest/globals';

const commands = ['HeadBucketCommand', 'CreateBucketCommand', 'PutBucketCorsCommand', 'GetBucketPolicyCommand', 'GetBucketAclCommand'];
const before = { ...process.env };
const send = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: class { send = send; destroy() {} },
  ...Object.fromEntries(commands.map((name) => [name, class {
    constructor(input) { this.name = name; this.input = input; }
  }])),
}));

afterEach(() => {
  process.env = { ...before };
  process.exitCode = 0;
  jest.restoreAllMocks();
  send.mockReset();
});

it('identifies a missing Books bucket setting instead of a generic storage failure', async () => {
  Object.assign(process.env, { S3_ENDPOINT: 'http://storage.test', S3_BUCKET_VIDEOS: 'videos', S3_BUCKET_MEDIA: 'media', S3_BUCKET_SLIPS: 'slips', S3_BUCKET_BOOKS: '' });
  send.mockResolvedValue({});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  await import('../../scripts/setup-storage.mjs?missing-books');
  expect(process.exitCode).toBe(1);
  expect(error.mock.calls[0]).toContain('S3_BUCKET_BOOKS is required; add it to .env');
});

it.each(['private', 'public-acl', 'public-policy'])('provisions books only with private access (%s)', async (mode) => {
  Object.assign(process.env, {
    S3_ENDPOINT: 'http://storage.test', S3_BUCKET_VIDEOS: 'videos',
    S3_BUCKET_MEDIA: 'media', S3_BUCKET_SLIPS: 'slips', S3_BUCKET_BOOKS: 'books',
    S3_CORS_ORIGINS: 'https://admin.example.test',
  });
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  send.mockImplementation(async ({ name }) => {
    if (name === 'GetBucketAclCommand') return mode === 'public-acl'
      ? { Grants: [{ Grantee: { URI: 'http://acs.amazonaws.com/groups/global/AllUsers' } }] }
      : { Grants: [] };
    if (name === 'GetBucketPolicyCommand') {
      if (mode === 'public-policy') return { Policy: JSON.stringify({ Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: 's3:GetObject' }] }) };
      throw Object.assign(new Error('no policy'), { name: 'NoSuchBucketPolicy' });
    }
    return {};
  });
  await import(`../../scripts/setup-storage.mjs?privacy=${mode}`);
  if (mode === 'private') {
    expect(error).not.toHaveBeenCalled();
    const booksCors = send.mock.calls.map(([command]) => command).find(({ name, input }) => name === 'PutBucketCorsCommand' && input.Bucket === 'books');
    expect(booksCors.input.CORSConfiguration.CORSRules[0]).toMatchObject({ AllowedOrigins: ['https://admin.example.test'], AllowedMethods: expect.arrayContaining(['GET', 'HEAD']) });
  } else {
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith('Storage setup failed:', mode === 'public-acl' ? 'BooksBucketPublicAcl' : 'BooksBucketPublicPolicy', expect.any(String));
  }
});
