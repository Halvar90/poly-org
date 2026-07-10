-- Add profile_icon to profiles and expose it in events_with_creator view

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_icon text NOT NULL DEFAULT 'bear';

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
  p.avatar_url AS creator_avatar_url,
  p.profile_icon AS creator_profile_icon
FROM public.events e
JOIN public.profiles p ON p.id = e.creator_id;

REVOKE ALL ON public.events_with_creator FROM PUBLIC;
GRANT SELECT ON public.events_with_creator TO authenticated;
