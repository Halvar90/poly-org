-- Migration 009 overwrote apply_runtime_migrations with an outdated events_with_creator
-- definition (missing recurrence_rule). Migration 012 added recurrence_rule to the view,
-- so the function now fails every startup with "cannot drop columns from view".
-- Fix: remove view DDL from the function — views are managed by numbered migrations.

CREATE OR REPLACE FUNCTION public.apply_runtime_migrations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  applied text[] := ARRAY[]::text[];
  jwt_claims jsonb;
  caller_role text;
BEGIN
  jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  caller_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    jwt_claims ->> 'role',
    ''
  );

  IF caller_role NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'apply_runtime_migrations denied for role: %', caller_role
      USING ERRCODE = '42501';
  END IF;

  -- Ensure ENUMs exist (idempotent, safe to repeat)
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'entry_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.entry_type AS ENUM ('termin', 'aufgabe', 'abwesenheit');
    applied := array_append(applied, 'create_type_entry_type');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'event_category' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.event_category AS ENUM ('arbeit', 'arzt', 'haushalt', 'freizeit', 'kind');
    applied := array_append(applied, 'create_type_event_category');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'calendar_view' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.calendar_view AS ENUM ('day', 'week', 'month', 'upcoming');
    applied := array_append(applied, 'create_type_calendar_view');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'theme_preference' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.theme_preference AS ENUM ('system', 'light', 'dark');
    applied := array_append(applied, 'create_type_theme_preference');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'recurrence_rule' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.recurrence_rule AS ENUM ('none', 'weekly', 'monthly');
    applied := array_append(applied, 'create_type_recurrence_rule');
  END IF;

  -- Ensure profile columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url text;
    applied := array_append(applied, 'add_profiles_avatar_url');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'profile_icon'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN profile_icon text NOT NULL DEFAULT 'bear';
    applied := array_append(applied, 'add_profiles_profile_icon');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'calendar_view_preference'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN calendar_view_preference public.calendar_view;
    applied := array_append(applied, 'add_profiles_calendar_view_preference');
  END IF;

  UPDATE public.profiles SET calendar_view_preference = 'month' WHERE calendar_view_preference IS NULL;
  ALTER TABLE public.profiles ALTER COLUMN calendar_view_preference SET DEFAULT 'month';
  ALTER TABLE public.profiles ALTER COLUMN calendar_view_preference SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'theme_preference'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN theme_preference public.theme_preference;
    applied := array_append(applied, 'add_profiles_theme_preference');
  END IF;

  UPDATE public.profiles SET theme_preference = 'system' WHERE theme_preference IS NULL;
  ALTER TABLE public.profiles ALTER COLUMN theme_preference SET DEFAULT 'system';
  ALTER TABLE public.profiles ALTER COLUMN theme_preference SET NOT NULL;

  -- Ensure event columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'is_ai_suggested'
  ) THEN
    ALTER TABLE public.events ADD COLUMN is_ai_suggested boolean NOT NULL DEFAULT false;
    applied := array_append(applied, 'add_events_is_ai_suggested');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'entry_type'
  ) THEN
    ALTER TABLE public.events ADD COLUMN entry_type public.entry_type;
    applied := array_append(applied, 'add_events_entry_type');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'category'
  ) THEN
    ALTER TABLE public.events ADD COLUMN category public.event_category;
    applied := array_append(applied, 'add_events_category');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'recurrence_rule'
  ) THEN
    ALTER TABLE public.events ADD COLUMN recurrence_rule public.recurrence_rule;
    applied := array_append(applied, 'add_events_recurrence_rule');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'type'
  ) THEN
    UPDATE public.events
    SET entry_type = CASE
      WHEN type::text IN ('aufgabe', 'erinnerung') THEN 'aufgabe'::public.entry_type
      WHEN type::text = 'abwesenheit' THEN 'abwesenheit'::public.entry_type
      ELSE 'termin'::public.entry_type
    END
    WHERE entry_type IS NULL;

    UPDATE public.events
    SET category = type::text::public.event_category
    WHERE category IS NULL
      AND type::text IN ('arbeit', 'arzt', 'haushalt', 'freizeit', 'kind');
  END IF;

  UPDATE public.events SET entry_type = 'termin' WHERE entry_type IS NULL;
  ALTER TABLE public.events ALTER COLUMN entry_type SET DEFAULT 'termin';
  ALTER TABLE public.events ALTER COLUMN entry_type SET NOT NULL;

  UPDATE public.events SET recurrence_rule = 'none' WHERE recurrence_rule IS NULL;
  ALTER TABLE public.events ALTER COLUMN recurrence_rule SET DEFAULT 'none';
  ALTER TABLE public.events ALTER COLUMN recurrence_rule SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'is_done'
  ) THEN
    ALTER TABLE public.events ADD COLUMN is_done boolean NOT NULL DEFAULT false;
    applied := array_append(applied, 'add_events_is_done');
  END IF;

  -- NOTE: Views (events_with_creator, reminders_with_creator) are intentionally NOT
  -- recreated here. They are managed exclusively by numbered migrations to avoid
  -- "cannot drop columns from view" errors when new columns are added.

  RETURN jsonb_build_object(
    'count', COALESCE(array_length(applied, 1), 0),
    'applied', applied
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_runtime_migrations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_runtime_migrations() TO authenticated;
