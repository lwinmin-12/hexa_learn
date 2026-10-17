import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const migrationName = '20261017000000_japanese_learning_demo';
const sql = await readFile(`prisma/migrations/${migrationName}/migration.sql`, 'utf8');
const previous = (await readdir('prisma/migrations')).filter(n => /^\d/.test(n) && n < migrationName).sort();
async function database() {
  const db = new PGlite();
  for (const name of previous) await db.exec(await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  return db;
}
const db = await database();
try {
  await db.exec(`INSERT INTO users (id, firebase_uid, provider, display_name) VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'unrelated-existing-user', 'google', 'Existing user');`);
  await db.exec(sql);
  const tables = ['users', 'courses', 'chapters', 'episodes', 'flashcards', 'quizzes', 'quiz_questions', 'quiz_options', 'enrollments', 'channels', 'channel_members', 'channel_messages', 'notifications'];
  const counts = {};
  for (const table of tables) counts[table] = Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
  assert.equal(counts.users, 4);
  assert.equal(counts.courses, 3);
  assert.equal(counts.chapters, 6);
  assert.equal(counts.episodes, 12);
  assert.ok(counts.flashcards >= 30);
  assert.equal(counts.quizzes, 6);
  for (const query of [
    `SELECT id FROM quizzes WHERE num_nonnulls(course_id, chapter_id, episode_id) <> 1`,
    `SELECT q.id FROM quiz_questions q LEFT JOIN quiz_options o ON o.question_id=q.id GROUP BY q.id HAVING count(o.id) <> 4 OR count(o.id) FILTER (WHERE o.is_correct) <> 1`,
    `SELECT q.id FROM quizzes q JOIN quiz_questions t ON t.quiz_id=q.id GROUP BY q.id HAVING q.pass_score < 1 OR q.pass_score > sum(t.points)`,
    `SELECT id FROM courses WHERE status <> 'published' OR is_premium`,
    `SELECT id FROM episodes WHERE status <> 'published' OR video_url IS NOT NULL OR video_upload_status <> 'pending'`,
    `SELECT e.id FROM enrollments e WHERE e.progress_pct <> 0 OR e.status <> 'active' OR e.access_type <> 'free'`,
    `SELECT m.id FROM channel_messages m LEFT JOIN channel_members cm ON cm.channel_id=m.channel_id AND cm.user_id=m.sender_id WHERE cm.user_id IS NULL`,
    `SELECT n.id FROM notifications n JOIN channel_messages m ON m.id=n.message_id LEFT JOIN channel_members cm ON cm.channel_id=m.channel_id AND cm.user_id=n.user_id WHERE cm.user_id IS NULL`,
  ]) assert.deepEqual((await db.query(query)).rows, [], query);
  assert.equal((await db.query(`SELECT display_name FROM users WHERE firebase_uid='unrelated-existing-user'`)).rows[0].display_name, 'Existing user');
  const slug = (await db.query('SELECT slug FROM courses ORDER BY slug LIMIT 1')).rows[0].slug;
  const conflictDb = await database();
  try {
    await conflictDb.exec(`INSERT INTO users (id, firebase_uid, provider) VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'existing-owner', 'google')`);
    await conflictDb.query(`INSERT INTO courses (id, owner_id, title, slug) VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'Existing course', $1)`, [slug]);
    await assert.rejects(conflictDb.exec(sql), error => error.code === '23505');
    await conflictDb.exec('ROLLBACK');
    assert.equal(Number((await conflictDb.query('SELECT count(*) AS n FROM users')).rows[0].n), 1);
    assert.equal(Number((await conflictDb.query('SELECT count(*) AS n FROM courses')).rows[0].n), 1);
    assert.equal(Number((await conflictDb.query('SELECT count(*) AS n FROM chapters')).rows[0].n), 0);
  } finally { await conflictDb.close(); }
  console.log(JSON.stringify({counts, checks: 'Foreign keys, content states, quiz scoring, existing data preservation, collision rollback passed'}, null, 2));
} finally { await db.close(); }
