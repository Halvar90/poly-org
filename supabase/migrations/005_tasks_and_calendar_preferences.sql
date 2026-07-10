-- Add task completion state and per-user calendar view preference
-- This migration also updates the events_with_creator view.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_view') THEN
    CREATE TYPE public.calendar_view AS ENUM ('day', 'week', 'month', 'upcoming');
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_view_preference public.calendar_view NOT NULL DEFAULT 'month';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT false;

DROP VIEW IF EXISTS public.events_with_creator CASCADE;

CREATE VIEW public.events_with_creator AS
SELECT
  e.id,
  e.creator_id,
  e.title,
  e.description,
  e.start_time,
  e.end_time,
  e.entry_type,
  e.category,
  e.color_code,
  e.is_ai_suggested,
  e.is_done,
  p.username AS creator_username,
  p.avatar_url AS creator_avatar_url
FROM public.events e
JOIN public.profiles p ON p.id = e.creator_id;

REVOKE ALL ON public.events_with_creator FROM PUBLIC;
GRANT SELECT ON public.events_with_creator TO authenticated;
