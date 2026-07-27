import { describe, expect, it } from 'vitest';
import { canEditOwnedRecord } from './permissions';

const member = { id: 'user-a', team_id: 1, role: 'member' as const, active: true };

describe('team record permissions', () => {
  it('lets members edit only their own records in their team', () => {
    expect(canEditOwnedRecord(member, { team_id: 1, created_by: 'user-a' })).toBe(true);
    expect(canEditOwnedRecord(member, { team_id: 1, created_by: 'user-b' })).toBe(false);
    expect(canEditOwnedRecord(member, { team_id: 2, created_by: 'user-a' })).toBe(false);
  });

  it('lets team administrators edit every record in their team only', () => {
    const admin = { ...member, id: 'admin-a', role: 'team_admin' as const };
    expect(canEditOwnedRecord(admin, { team_id: 1, created_by: 'user-b' })).toBe(true);
    expect(canEditOwnedRecord(admin, { team_id: 2, created_by: 'user-b' })).toBe(false);
  });

  it('lets super administrators edit records from all teams', () => {
    const superAdmin = { ...member, id: 'root', team_id: null, role: 'super_admin' as const };
    expect(canEditOwnedRecord(superAdmin, { team_id: 1, created_by: 'user-a' })).toBe(true);
    expect(canEditOwnedRecord(superAdmin, { team_id: 2, created_by: 'user-b' })).toBe(true);
  });

  it('denies inactive accounts', () => {
    expect(canEditOwnedRecord({ ...member, active: false }, { team_id: 1, created_by: 'user-a' })).toBe(false);
  });
});
