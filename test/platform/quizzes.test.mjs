import { it, expect } from '@jest/globals';
import { correctSet } from '../../dist/quizzes/quizzes.service.js';
it('requires exact multi-select sets', () => {
  expect(correctSet(['a', 'b'], ['b', 'a'])).toBe(true);
  expect(correctSet(['a'], ['a', 'b'])).toBe(false);
  expect(correctSet(['a', 'a'], ['a', 'b'])).toBe(false);
  expect(correctSet(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
});
