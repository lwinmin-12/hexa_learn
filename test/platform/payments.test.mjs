import { it, expect } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { discount } from '../../dist/payments/payments.service.js';
it('uses Decimal and caps discounts', () => {
  expect(
    discount(
      new Prisma.Decimal('19.99'),
      'percent',
      new Prisma.Decimal('10'),
    ).toString(),
  ).toBe('2');
  expect(
    discount(
      new Prisma.Decimal('5'),
      'fixed',
      new Prisma.Decimal('99'),
    ).toString(),
  ).toBe('5');
});
