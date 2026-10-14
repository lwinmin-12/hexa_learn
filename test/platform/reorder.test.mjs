import { it, expect } from '@jest/globals';
import { reorderRows } from '../../dist/platform/reorder.js';
it('uses vacant temporary positions before assigning final positions', async () => {
  const rows = [
    { id: 'a', position: -1 },
    { id: 'b', position: 1 },
  ];
  await reorderRows(rows, ['b', 'a'], async (id, position) => {
    expect(rows.some((r) => r.id !== id && r.position === position)).toBe(
      false,
    );
    rows.find((r) => r.id === id).position = position;
  });
  expect(rows).toEqual([
    { id: 'a', position: 2 },
    { id: 'b', position: 1 },
  ]);
});
it('rejects missing and repeated siblings', async () => {
  await expect(
    reorderRows([{ id: 'a', position: 1 }], [], async () => {}),
  ).rejects.toMatchObject({ status: 400 });
});
