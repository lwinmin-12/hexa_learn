// Compose's database credentials may contain reserved URL characters.
process.env.DATABASE_URL = `postgresql://${encodeURIComponent(process.env.POSTGRES_USER!)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD!)}@db:5432/${encodeURIComponent(process.env.POSTGRES_DB!)}?schema=public`;

if (process.argv[2] === 'setup') {
  const { spawnSync } = await import('node:child_process');
  for (const args of [['run', 'db:migrate'], ['run', 'storage:init']]) {
    const result = spawnSync('npm', args, { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} else {
  await import('./main.js');
}
export {};
