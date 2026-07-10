-- Ensure profile preference columns exist and are usable on older databases

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_view') THEN
    CREATE TYPE public.calendar_view AS ENUM ('day', 'week', 'month', 'upcoming');
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_view_preference public.calendar_view;

UPDATE public.profiles
SET calendar_view_preference = 'month'
WHERE calendar_view_preference IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN calendar_view_preference SET DEFAULT 'month';

ALTER TABLE public.profiles
  ALTER COLUMN calendar_view_preference SET NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;
