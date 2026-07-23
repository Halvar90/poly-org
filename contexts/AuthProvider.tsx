import * as SplashScreen from 'expo-splash-screen';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import type { ProfileIconValue } from '@/lib/profileIcons';

import { applyRuntimeMigrations } from '@/lib/runtimeMigrations';
import { registerPushToken } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

export type Profile = {
  id: string;
  username: string;
  color_code: string;
  profile_icon: ProfileIconValue | null;
  household_id: string | null;
  calendar_view_preference?: 'day' | 'week' | 'month' | 'upcoming';
  theme_preference?: 'system' | 'light' | 'dark';
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string') return value;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, color_code, profile_icon, household_id, calendar_view_preference, theme_preference')
      .eq('id', userId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    const message = getErrorMessage(error);

    if (
      message.includes('profile_icon') ||
      message.includes('calendar_view_preference') ||
      message.includes('theme_preference') ||
      message.includes('household_id')
    ) {
      const { data, error: fallbackError } = await supabase
        .from('profiles')
        .select('id, username, color_code')
        .eq('id', userId)
        .single();

      if (fallbackError) {
        console.warn('Profil konnte nicht geladen werden:', fallbackError.message);
        return null;
      }

      console.warn(
        'Profil geladen ohne optionales Profil-Icon / Kalenderansicht. Bitte prüfe die DB-Migration.',
      );

      return {
        ...data,
        profile_icon: null,
        household_id: null,
        calendar_view_preference: 'month',
        theme_preference: 'system',
      };
    }

    console.warn('Profil konnte nicht geladen werden:', message);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      return;
    }

    const nextProfile = await loadProfile(userId);
    setProfile(nextProfile);
  }, [session?.user?.id]);

  useEffect(() => {
    let isMounted = true;

    async function refreshProfileAfterMigrations(userId: string) {
      await applyRuntimeMigrations();
      if (!isMounted) return;
      const migratedProfile = await loadProfile(userId);
      if (isMounted) setProfile(migratedProfile);
      void registerPushToken(userId);
    }

    async function initAuth() {
      let loadingResolved = false;
      const finishLoading = () => {
        if (isMounted && !loadingResolved) {
          loadingResolved = true;
          setIsLoading(false);
          void SplashScreen.hideAsync();
        }
      };

      // Sicherheitsnetz gegen ein bekanntes Supabase-Problem: getSession() kann
      // nach dem Aufwecken der App aus dem Hintergrund hängen bleiben (interner
      // Refresh-Lock wird nicht sauber freigegeben). Ohne Timeout bliebe der
      // Ladekreis dann für immer stehen, bis man die Seite manuell neu lädt.
      const timeoutId = setTimeout(finishLoading, 8000);

      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      clearTimeout(timeoutId);

      if (!isMounted) return;

      setSession(initialSession);

      if (initialSession?.user) {
        const initialProfile = await loadProfile(initialSession.user.id);
        if (isMounted) setProfile(initialProfile);
        void refreshProfileAfterMigrations(initialSession.user.id);
      } else {
        setProfile(null);
      }

      finishLoading();
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession);

      if (nextSession?.user) {
        const nextProfile = await loadProfile(nextSession.user.id);
        if (isMounted) setProfile(nextProfile);

        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          void refreshProfileAfterMigrations(nextSession.user.id);
        }
      } else if (isMounted) {
        setProfile(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;

      supabase.auth.getSession().then(async ({ data: { session: refreshedSession } }) => {
        if (!isMounted) return;
        setSession(refreshedSession);

        // Ohne diesen Reload kann `profile` (und damit household_id) nach dem
        // Aufwecken aus dem Hintergrund veraltet bleiben, während Screens ihre
        // haushaltsbezogenen Daten per useFocusEffect schon neu laden.
        if (refreshedSession?.user) {
          const refreshedProfile = await loadProfile(refreshedSession.user.id);
          if (isMounted) setProfile(refreshedProfile);
        }
      });
    });

    return () => {
      isMounted = false;
      appStateSubscription.remove();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,
      refreshProfile,
    }),
    [session, profile, isLoading, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.');
  }

  return context;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
