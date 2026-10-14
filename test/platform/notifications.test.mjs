import { it, expect, jest } from '@jest/globals';
import { NotificationDeliveryService } from '../../dist/notifications/notification-delivery.service.js';
it('creates deduplicated notifications for non-muted members', async () => {
  const createMany = jest.fn();
  const send = jest.fn();
  const members = jest
    .fn()
    .mockResolvedValueOnce([{ userId: 'u' }])
    .mockResolvedValueOnce([]);
  const service = new NotificationDeliveryService(
    {
      channelMessage: {
        findUnique: async () => ({
          id: 'm',
          title: 'Title',
          body: 'Body',
          channelId: 'c',
          channel: { courseId: 'course' },
        }),
      },
      channelMember: { findMany: members },
      notification: { createMany },
    },
    { send },
  );
  await service.message('m');
  expect(members.mock.calls[0][0].where.isMuted).toBe(false);
  expect(createMany).toHaveBeenCalledWith({
    data: [{ userId: 'u', messageId: 'm' }],
    skipDuplicates: true,
  });
  expect(send).toHaveBeenCalledWith(['u'], 'Title', 'Body', {
    messageId: 'm',
    courseId: 'course',
  });
});
