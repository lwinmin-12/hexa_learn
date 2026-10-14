import {fail} from './common.js';
export async function reorderRows(
  rows: { id: string; position: number }[],
  ids: string[],
  update: (id: string, position: number) => Promise<unknown>,
) {
  if (
    ids.length !== rows.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !rows.some((r) => r.id === id))
  )
    fail(
      400,
      'INVALID_REORDER',
      'ids must contain exactly the existing siblings',
    );
  const start = Math.min(0, ...rows.map((r) => r.position)) - rows.length - 1;
  for (let i = 0; i < ids.length; i++) await update(ids[i], start - i);
  for (let i = 0; i < ids.length; i++) await update(ids[i], i + 1);
  return { ids };
}
