-- Add recurrence options for events/tasks and expose them in event view.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'recurrence_rule' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.recurrence_rule AS ENUM ('none', 'weekly', 'monthly');
  END IF;
END $$;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS recurrence_rule public.recurrence_rule;

UPDATE public.events
SET recurrence_rule = 'none'
WHERE recurrence_rule IS NULL;

ALTER TABLE public.events
ALTER COLUMN recurrence_rule SET DEFAULT 'none';

ALTER TABLE public.events
ALTER COLUMN recurrence_rule SET NOT NULL;

CREATE OR REPLACE VIEW public.events_with_creator AS
SELECT
  e.id,
  e.creator_id,
  e.title,
  e.description,
  e.start_time,
  e.end_time,
  e.entry_type,
  e.category,
  p.color_code AS color_code,
  e.is_ai_suggested,
  e.is_done,
  p.username AS creator_username,
  p.avatar_url AS creator_avatar_url,
  p.profile_icon AS creator_profile_icon,
  e.recurrence_rule
FROM public.events e
JOIN public.profiles p ON p.id = e.creator_id;

REVOKE ALL ON public.events_with_creator FROM PUBLIC;
GRANT SELECT ON public.events_with_creator TO authenticated;
