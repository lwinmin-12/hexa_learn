import { describe, it, expect } from '@jest/globals';
import {
  paging,
  listed,
  PageDto,
  RolesGuard,
} from '../../dist/platform/common.js';
describe('shared conventions', () => {
  it('paginates consistently', () => {
    const q = new PageDto();
    expect(paging(q)).toEqual({ skip: 0, take: 20 });
    expect(listed([], 0, q).meta).toEqual({ page: 1, limit: 20, total: 0 });
  });
  it('requires verified phone', () => {
    const guard = new RolesGuard({ getAllAndOverride: () => ['learner'] });
    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            auth: { user: { role: 'learner', phoneVerifiedAt: null } },
          }),
        }),
      }),
    ).toThrow('Verify your phone');
  });
});
import { OwnershipService } from '../../dist/platform/ownership.service.js';
it('hides another page admin course with 404', async () => {
  const scope = new OwnershipService({
    course: {
      findUnique: async () => ({ id: 'course' }),
      findFirst: async () => null,
    },
  });
  await expect(
    scope.check({ id: 'pa', role: 'page_admin' }, 'course', 'course'),
  ).rejects.toMatchObject({ status: 404 });
});
