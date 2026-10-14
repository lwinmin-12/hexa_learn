import { it, expect, jest } from '@jest/globals';
import { PublishingService } from '../../dist/platform/publishing.service.js';
it('skips when another instance owns the lock', async () => {
  const transaction = jest.fn();
  await new PublishingService(
    { $transaction: transaction },
    { redis: { set: async () => null } },
  ).publish();
  expect(transaction).not.toHaveBeenCalled();
});
it('releases its lock after publishing failure', async () => {
  const release = jest.fn();
  const db = {
    course: { updateMany: () => Promise.resolve() },
    episode: { updateMany: () => Promise.resolve() },
    $transaction: async () => {
      throw new Error('db failed');
    },
  };
  await expect(
    new PublishingService(db, {
      redis: { set: async () => 'OK', eval: release },
    }).publish(),
  ).rejects.toThrow('db failed');
  expect(release).toHaveBeenCalled();
});
