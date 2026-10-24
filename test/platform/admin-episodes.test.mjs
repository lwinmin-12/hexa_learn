import 'reflect-metadata';
import { afterEach, it, expect, jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminContentService } from '../../dist/admin-content/admin-content.service.js';
import { OwnershipService } from '../../dist/platform/ownership.service.js';
import {
  UpdateEpisodeDto,
  ConfirmVideoDto,
} from '../../dist/admin-content/admin-content.dto.js';
const user = { id: 'admin', role: 'page_admin' };
const key =
  'courses/course/episodes/episode/00000000-0000-4000-8000-000000000000.mp4';
function fixture(overrides = {}) {
  let row = {
    id: 'episode',
    chapterId: 'chapter',
    title: 'Video',
    description: null,
    position: 1,
    status: 'draft',
    publishAt: null,
    videoUrl: key,
    videoUploadStatus: 'ready',
    videoDurationSec: 45,
    videoScheduledAt: null,
    ...overrides,
  };
  const db = {
    episode: {
      findUnique: jest.fn(async () => ({ chapter: { courseId: 'course' } })),
      findUniqueOrThrow: jest.fn(async () => ({ ...row })),
      update: jest.fn(async ({ data }) => {
        for (const [field, value] of Object.entries(data))
          if (value !== undefined)
            row[field] =
              ['publishAt', 'videoScheduledAt'].includes(field) &&
              value !== null
                ? new Date(value)
                : value;
        return row;
      }),
    },
    course: {
      findUnique: jest.fn(async () => ({ id: 'course' })),
      findFirst: jest.fn(async ({ where }) =>
        !where.ownerId || where.ownerId === 'admin' ? { id: 'course' } : null,
      ),
      findUniqueOrThrow: jest.fn(async () => ({
        coverUrl: null,
        _count: { books: 0 },
        chapters: [{ _count: { books: 0 }, episodes: [row] }],
      })),
    },
  };
  const storage = {
    get: jest.fn(async () => 'https://storage.test/signed'),
    head: jest.fn(async () => ({ ContentLength: 10 })),
  };
  const jobs = { add: jest.fn() };
  return {
    db,
    storage,
    jobs,
    service: new AdminContentService(
      db,
      new OwnershipService(db),
      storage,
      jobs,
    ),
  };
}
afterEach(() => jest.useRealTimers());
it.each([
  ['ready', key, true],
  ['pending', key, false],
  ['failed', key, false],
  ['ready', null, false],
])(
  'only signs a ready stored video (%s, %s)',
  async (videoUploadStatus, videoUrl, ready) => {
    const { service, storage } = fixture({ videoUploadStatus, videoUrl });
    const result = await service.episodeDetail(user, 'episode');
    expect(result.playbackUrl).toBe(
      ready ? 'https://storage.test/signed' : null,
    );
    expect(result).not.toHaveProperty('videoUrl');
    expect(storage.get).toHaveBeenCalledTimes(ready ? 1 : 0);
    const course = await service.detail(user, 'course');
    expect(course.chapters[0].episodes[0]).toEqual(result);
  },
);
it('hides other page admin episodes with 404 and permits super admins', async () => {
  const { service, storage } = fixture();
  await expect(
    service.episodeDetail({ ...user, id: 'other' }, 'episode'),
  ).rejects.toMatchObject({ status: 404 });
  expect(storage.get).not.toHaveBeenCalled();
  expect(
    (
      await service.episodeDetail(
        { id: 'other', role: 'super_admin' },
        'episode',
      )
    ).playbackUrl,
  ).toBeTruthy();
});
it('preserves exact UTC timestamps on patch and confirmation, and clears only explicit null', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-23T06:40:00.000Z'));
  const { service, jobs } = fixture();
  const publishAt = '2026-10-23T06:44:00.000Z';
  const scheduledAt = '2026-10-23T06:44:37.123Z';
  const patch = await service.updateEpisode(user, 'episode', {
    publishAt,
    scheduledAt,
    status: 'scheduled',
  });
  expect(JSON.parse(JSON.stringify(patch))).toMatchObject({
    publishAt,
    videoScheduledAt: scheduledAt,
  });
  const confirmed = await service.confirm(user, 'episode', {
    storageKey: key,
    durationSec: 100,
  });
  expect(JSON.parse(JSON.stringify(confirmed))).toMatchObject({
    publishAt,
    videoScheduledAt: scheduledAt,
    videoUploadStatus: 'ready',
    playbackUrl: expect.any(String),
  });
  expect(confirmed).not.toHaveProperty('videoUrl');
  expect(jobs.add).not.toHaveBeenCalled();
  expect(
    await service.updateEpisode(user, 'episode', { scheduledAt: null }),
  ).toHaveProperty('videoScheduledAt', null);
  expect(
    await service.updateEpisode(user, 'episode', {
      status: 'draft',
      publishAt: null,
    }),
  ).toHaveProperty('publishAt', null);
  const confirmSchedule = await service.confirm(user, 'episode', {
    storageKey: key,
    durationSec: 100,
    publishAt,
    scheduledAt,
  });
  expect(JSON.parse(JSON.stringify(confirmSchedule))).toMatchObject({
    publishAt,
    videoScheduledAt: scheduledAt,
  });
  const cleared = await service.confirm(user, 'episode', {
    storageKey: key,
    durationSec: 100,
    publishAt: null,
    scheduledAt: null,
  });
  expect(cleared).toMatchObject({ publishAt: null, videoScheduledAt: null });
});
it.each(['publishAt', 'scheduledAt'])(
  'rejects past %s with tolerance on both write routes',
  async (field) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T06:40:00.000Z'));
    const { service, db } = fixture();
    const past = { [field]: '2026-10-23T06:38:59.999Z' };
    for (const action of [
      () => service.updateEpisode(user, 'episode', past),
      () =>
        service.confirm(user, 'episode', {
          storageKey: key,
          durationSec: 10,
          ...past,
        }),
    ]) {
      await expect(action()).rejects.toMatchObject({
        status: 400,
        response: { code: 'SCHEDULE_IN_PAST' },
      });
    }
    expect(db.episode.update).not.toHaveBeenCalled();
    await service.updateEpisode(user, 'episode', {
      [field]: '2026-10-23T06:39:00.000Z',
    });
  },
);
it('requires publishAt for the effective scheduled state, including clearing it', async () => {
  const { service } = fixture();
  await expect(
    service.updateEpisode(user, 'episode', { status: 'scheduled' }),
  ).rejects.toMatchObject({
    status: 400,
    response: { code: 'PUBLISH_AT_REQUIRED' },
  });
  const scheduled = fixture({
    status: 'scheduled',
    publishAt: new Date('2030-01-01T00:00:00.000Z'),
  });
  await expect(
    scheduled.service.updateEpisode(user, 'episode', { publishAt: null }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    scheduled.service.confirm(user, 'episode', {
      storageKey: key,
      durationSec: 10,
      publishAt: null,
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it('rejects scheduling a draft with an expired stored publishAt', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-23T06:40:00.000Z'));
  const { service } = fixture({ publishAt: new Date('2026-10-23T06:38:00.000Z') });
  await expect(service.updateEpisode(user, 'episode', { status: 'scheduled' })).rejects.toMatchObject({ status: 400, response: { code: 'SCHEDULE_IN_PAST' } });
});
it('verifies upload before saving and queues replacement deletion', async () => {
  const { service, storage, jobs, db } = fixture({ videoUrl: 'old.mp4' });
  storage.head.mockRejectedValueOnce(new Error('missing'));
  await expect(
    service.confirm(user, 'episode', { storageKey: key, durationSec: 10 }),
  ).rejects.toThrow('missing');
  expect(db.episode.update).not.toHaveBeenCalled();
  await service.confirm(user, 'episode', { storageKey: key, durationSec: 10 });
  expect(storage.head).toHaveBeenCalledWith('VIDEOS', key);
  expect(jobs.add).toHaveBeenCalledWith('storage-cleanup', {
    objects: [{ bucket: 'VIDEOS', key: 'old.mp4' }],
  });
});
it.each([UpdateEpisodeDto, ConfirmVideoDto])(
  'accepts nullable UTC timestamps and rejects local/offset/invalid dates',
  async (Dto) => {
    const base =
      Dto === ConfirmVideoDto ? { storageKey: key, durationSec: 1 } : {};
    for (const value of [null, '2026-10-23T06:44:00.000Z'])
      expect(
        await validate(
          plainToInstance(Dto, {
            ...base,
            publishAt: value,
            scheduledAt: value,
          }),
        ),
      ).toHaveLength(0);
    for (const value of [
      '2026-10-23',
      '2026-10-23T06:44:00',
      '2026-10-23T06:44:00+07:00',
      '2026-02-30T06:44:00.000Z',
    ])
      expect(
        (
          await validate(
            plainToInstance(Dto, {
              ...base,
              publishAt: value,
              scheduledAt: value,
            }),
          )
        )
          .map((error) => error.property)
          .sort(),
      ).toEqual(['publishAt', 'scheduledAt']);
  },
);
