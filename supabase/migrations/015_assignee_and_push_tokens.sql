-- Add push token storage to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS expo_push_token text;

-- Add assignee to events (who the event is created FOR)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add assignee to reminders
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Rebuild events_with_creator to include assignee columns
-- Using DROP + CREATE since we need to add columns (not just replace)
DROP VIEW IF EXISTS public.events_with_creator;
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
  p.color_code AS color_code,
  e.is_ai_suggested,
  e.is_done,
  p.username   AS creator_username,
  p.avatar_url AS creator_avatar_url,
  p.profile_icon AS creator_profile_icon,
  e.recurrence_rule,
  e.assignee_id,
  a.username   AS assignee_username
FROM public.events e
JOIN  public.profiles p ON p.id = e.creator_id
LEFT JOIN public.profiles a ON a.id = e.assignee_id;

REVOKE ALL ON public.events_with_creator FROM PUBLIC;
GRANT SELECT ON public.events_with_creator TO authenticated;

-- Rebuild reminders_with_creator to include assignee columns
DROP VIEW IF EXISTS public.reminders_with_creator;
CREATE VIEW public.reminders_with_creator AS
SELECT
  r.id,
  r.title,
  r.description,
  r.creator_id,
  r.is_done,
  r.created_at,
  r.updated_at,
  p.username AS creator_username,
  p.color_code AS color_code,
  r.assignee_id,
  a.username AS assignee_username
FROM public.reminders r
JOIN  public.profiles p ON p.id = r.creator_id
LEFT JOIN public.profiles a ON a.id = r.assignee_id;

REVOKE ALL ON public.reminders_with_creator FROM PUBLIC;
GRANT SELECT ON public.reminders_with_creator TO authenticated;
