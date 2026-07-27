export type PermissionProfile = {
  id: string;
  team_id: number | null;
  role: 'member' | 'team_admin' | 'super_admin';
  active: boolean;
};

export type OwnedRecord = {
  team_id?: number | null;
  created_by?: string | null;
};

export const canEditOwnedRecord = (
  profile?: PermissionProfile | null,
  record?: OwnedRecord | null,
) => {
  if (!profile?.active || !record) return false;
  if (profile.role === 'super_admin') return true;
  if (record.team_id !== profile.team_id) return false;
  return profile.role === 'team_admin' || record.created_by === profile.id;
};
