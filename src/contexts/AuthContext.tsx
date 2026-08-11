import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, UserRole } from '@/lib/types';
import { identifyUser, resetUser } from '@/lib/monitoring';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;          // true during initial auth check
  profileLoading: boolean;   // true while fetching profile after auth resolves
  profileError: boolean;     // true when the profile could not be loaded (backend down/timeout)
  retryProfile: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_QUERY_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('profile_timeout')), ms)),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    setProfileError(false);
    try {
      // Two attempts with a hard timeout each: the backend may be slow or the
      // signup trigger may not have committed yet, but the UI must never hang.
      let data: Profile | null = null;
      let failed = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await withTimeout(
            supabase
              .from('profiles')
              .select('id,email,full_name,role,is_active,approval_status,market,country_code,phone,created_at,updated_at')
              .eq('id', userId)
              .maybeSingle(),
            PROFILE_QUERY_TIMEOUT_MS,
          );
          if (res.error) {
            failed = true;
          } else if (res.data) {
            data = res.data as Profile;
            failed = false;
            break;
          } else {
            failed = false; // query worked, profile simply does not exist yet
          }
        } catch {
          failed = true; // timed out / network failure
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
      }
      setProfile(data);
      setProfileError(failed && !data);
      // Associate telemetry with the user (opaque id + role only, no PII).
      if (data) identifyUser(userId, data.role ?? null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const retryProfile = useCallback(() => {
    if (user?.id) void fetchProfile(user.id);
  }, [user?.id, fetchProfile]);


  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        if (nextSession?.user) {
          setTimeout(() => fetchProfile(nextSession.user.id), 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    // Safety net: if the token refresh request hangs or fails (offline, backend
    // hiccup), never leave the app stuck on the initial loading screen — the
    // user must always be able to reach /auth.
    const failSafe = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 4000);

    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        if (cancelled) return;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        if (initialSession?.user) {
          fetchProfile(initialSession.user.id);
        }
      })
      .catch(() => {
        // Network/refresh failure: treat as signed out so the login screen renders.
        if (cancelled) return;
        setSession(null);
        setUser(null);
        setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(failSafe);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);


  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: 'pending' },
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    resetUser();
  }, []);

  const role = profile?.role ?? null;

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      profile,
      role,
      loading,
      profileLoading,
      profileError,
      retryProfile,
      signIn,
      signUp,
      signOut,
    }),
    [session, user, profile, role, loading, profileLoading, profileError, retryProfile, signIn, signUp, signOut],
  );


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
