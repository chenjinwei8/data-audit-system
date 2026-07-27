import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { canEditOwnedRecord, type OwnedRecord } from './permissions';

export type UserRole = 'member' | 'team_admin' | 'super_admin';

export type UserProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  team_id: number | null;
  role: UserRole;
  active: boolean;
  team?: { id: number; name: string; active: boolean } | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileError: string;
  isSuperAdmin: boolean;
  isTeamAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  canEditRecord: (record?: OwnedRecord | null) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const loadUserProfile = async (userId: string) => {
  const result = await supabase
    .from('user_profile')
    .select('*, team:team(id, name, active)')
    .eq('id', userId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as UserProfile | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  const refreshProfile = useCallback(async () => {
    const currentUser = session?.user;
    if (!currentUser) {
      setProfile(null);
      setProfileError('');
      return;
    }
    try {
      setProfileError('');
      setProfile(await loadUserProfile(currentUser.id));
    } catch (error) {
      setProfile(null);
      setProfileError(error instanceof Error ? error.message : '人员权限信息加载失败');
    }
  }, [session?.user]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) setProfileError(error.message);
      setSession(data.session);
      if (data.session?.user) {
        try {
          setProfile(await loadUserProfile(data.session.user.id));
        } catch (profileLoadError) {
          setProfileError(profileLoadError instanceof Error ? profileLoadError.message : '人员权限信息加载失败');
        }
      }
      if (mounted) setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setProfileError('');
      } else {
        window.setTimeout(() => {
          loadUserProfile(nextSession.user.id)
            .then(nextProfile => setProfile(nextProfile))
            .catch(error => setProfileError(error instanceof Error ? error.message : '人员权限信息加载失败'));
        }, 0);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const canEditRecord = useCallback((record?: OwnedRecord | null) => canEditOwnedRecord(profile, record), [profile]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user || null,
    profile,
    loading,
    profileError,
    isSuperAdmin: profile?.active === true && profile.role === 'super_admin',
    isTeamAdmin: profile?.active === true && profile.role === 'team_admin',
    signIn,
    signOut,
    refreshProfile,
    canEditRecord,
  }), [session, profile, loading, profileError, signIn, signOut, refreshProfile, canEditRecord]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
