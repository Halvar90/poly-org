-- Persisted app theme preference per user profile.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'theme_preference') THEN
    CREATE TYPE public.theme_preference AS ENUM ('system', 'light', 'dark');
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_preference public.theme_preference NOT NULL DEFAULT 'system';
