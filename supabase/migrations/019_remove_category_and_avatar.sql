-- Produktentscheidung: Event-Kategorien werden nicht gebraucht (nie ueber die UI
-- setzbar gewesen) und eigene Avatar-Uploads sind nicht vorgesehen (nie umgesetzt).
-- Beide Felder waren totes Schema ohne UI-Anbindung - werden komplett entfernt.

DROP VIEW IF EXISTS public.events_with_creator;

ALTER TABLE public.events DROP COLUMN IF EXISTS category;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS avatar_url;

DROP TYPE IF EXISTS public.event_category;

CREATE VIEW public.events_with_creator AS
SELECT
  e.id,
  e.creator_id,
  e.title,
  e.description,
  e.start_time,
  e.end_time,
  e.entry_type,
  p.color_code AS color_code,
  e.is_ai_suggested,
  e.is_done,
  p.username   AS creator_username,
  p.profile_icon AS creator_profile_icon,
  e.recurrence_rule,
  e.assignee_id,
  a.username   AS assignee_username
FROM public.events e
JOIN  public.profiles p ON p.id = e.creator_id
LEFT JOIN public.profiles a ON a.id = e.assignee_id;

REVOKE ALL ON public.events_with_creator FROM PUBLIC;
GRANT SELECT ON public.events_with_creator TO authenticated;

-- Trigger legte bisher auch avatar_url beim Signup an - Spalte existiert nicht mehr.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, profile_icon, color_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1), 'Neuer User'),
    COALESCE(NEW.raw_user_meta_data ->> 'profile_icon', 'bear'),
    COALESCE(NEW.raw_user_meta_data ->> 'color_code', '#6B4EAA')
  );
  RETURN NEW;
END;
$$;
