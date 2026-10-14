import {Inject, Injectable} from '@nestjs/common';
import type { User } from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {parse} from 'csv-parse/sync';
import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';
import {PrismaService} from '../prisma/prisma.service.js';
import {OwnershipService} from '../platform/ownership.service.js';
import {StorageService} from '../platform/storage.service.js';
import {JobsService} from '../platform/jobs.service.js';
import {PageDto, paging, listed, fail} from '../platform/common.js';
import {serial} from '../platform/transaction.js';
import {FlashcardDto, UpdateFlashcardDto, AudioDto, UpdateAudioDto} from './admin-learning-tools.dto.js';
@Injectable()
export class AdminLearningToolsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(OwnershipService) private readonly scope: OwnershipService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}
  async flashcards(user: User, id: string, q: PageDto) {
    await this.scope.check(user, 'chapter', id);
    const where = { chapterId: id };
    const [data, total] = await this.db.$transaction([
      this.db.flashcard.findMany({
        where,
        ...paging(q),
        orderBy: { position: 'asc' },
      }),
      this.db.flashcard.count({ where }),
    ]);
    return listed(data, total, q);
  }
  async createFlashcard(user: User, id: string, dto: FlashcardDto) {
    await this.scope.check(user, 'chapter', id);
    return serial(this.db, async (tx) => {
      const max = await tx.flashcard.aggregate({
        where: { chapterId: id },
        _max: { position: true },
      });
      return tx.flashcard.create({
        data: {
          ...dto,
          chapterId: id,
          position: dto.position ?? (max._max.position ?? 0) + 1,
        },
      });
    });
  }
  async updateFlashcard(user: User, id: string, dto: UpdateFlashcardDto) {
    await this.scope.check(user, 'flashcard', id);
    return this.db.flashcard.update({ where: { id }, data: dto });
  }
  async deleteFlashcard(user: User, id: string) {
    await this.scope.check(user, 'flashcard', id);
    const f = await this.db.flashcard.delete({ where: { id } });
    if (f.audioUrl && !/^https?:/.test(f.audioUrl))
      await this.jobs.add('storage-cleanup', {
        objects: [{ bucket: 'MEDIA', key: f.audioUrl }],
      });
    return { deleted: true };
  }
  async import(user: User, id: string, file: Express.Multer.File) {
    await this.scope.check(user, 'chapter', id);
    if (!file || file.size > 5 * 1024 * 1024)
      fail(400, 'INVALID_CSV', 'CSV up to 5 MB is required');
    let rows: Record<string, string>[];
    try {
      rows = parse(file.buffer, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        max_record_size: 12000,
      });
    } catch {
      fail(400, 'INVALID_CSV', 'CSV could not be parsed');
    }
    if (rows.length > 1000)
      fail(400, 'INVALID_CSV', 'Maximum 1000 flashcards per import');
    const data: FlashcardDto[] = [];
    for (const row of rows) {
      if (
        Object.keys(row).some(
          (k) => !['front_text', 'back_text', 'audio_url'].includes(k),
        )
      )
        fail(400, 'INVALID_CSV', 'Unexpected CSV column');
      const dto = plainToInstance(FlashcardDto, {
        frontText: row.front_text,
        backText: row.back_text,
        ...(row.audio_url ? { audioUrl: row.audio_url } : {}),
      });
      if ((await validate(dto)).length)
        fail(
          400,
          'INVALID_CSV',
          'Each row requires valid front_text, back_text and optional audio_url',
        );
      data.push(dto);
    }
    return serial(this.db, async (tx) => {
      const max = await tx.flashcard.aggregate({
        where: { chapterId: id },
        _max: { position: true },
      });
      return tx.flashcard.createMany({
        data: data.map((d, i) => ({
          ...d,
          chapterId: id,
          position: (max._max.position ?? 0) + i + 1,
        })),
      });
    });
  }
  async audio(user: User, id: string, q: PageDto) {
    await this.scope.check(user, 'chapter', id);
    const where = { chapterId: id };
    const [data, total] = await this.db.$transaction([
      this.db.audioTrack.findMany({
        where,
        ...paging(q),
        orderBy: { position: 'asc' },
      }),
      this.db.audioTrack.count({ where }),
    ]);
    return listed(data, total, q);
  }
  async createAudio(
    user: User,
    id: string,
    dto: AudioDto,
    file: Express.Multer.File,
  ) {
    const c = await this.scope.check(user, 'chapter', id);
    if (
      !file ||
      file.size > 30 * 1024 * 1024 ||
      !['audio/mpeg', 'audio/mp3'].includes(file.mimetype)
    )
      fail(400, 'INVALID_AUDIO', 'An MP3 up to 30 MB is required');
    const b = file.buffer;
    if (!(
      b.toString('ascii', 0, 3) === 'ID3' ||
      (b[0] === 255 && (b[1] & 224) === 224)
    ))
      fail(400, 'INVALID_AUDIO', 'File is not MP3 audio');
    const key = `courses/${c.id}/chapters/${id}/audio/${randomUUID()}.mp3`;
    await this.storage.put('MEDIA', key, b, 'audio/mpeg');
    return serial(this.db, async (tx) => {
      const max = await tx.audioTrack.aggregate({
        where: { chapterId: id },
        _max: { position: true },
      });
      return tx.audioTrack.create({
        data: {
          ...dto,
          chapterId: id,
          audioUrl: key,
          position: dto.position ?? (max._max.position ?? 0) + 1,
        },
      });
    });
  }
  async updateAudio(user: User, id: string, dto: UpdateAudioDto) {
    await this.scope.check(user, 'audio', id);
    return this.db.audioTrack.update({ where: { id }, data: dto });
  }
  async deleteAudio(user: User, id: string) {
    await this.scope.check(user, 'audio', id);
    const a = await this.db.audioTrack.delete({ where: { id } });
    await this.jobs.add('storage-cleanup', {
      objects: [{ bucket: 'MEDIA', key: a.audioUrl }],
    });
    return { deleted: true };
  }
}
