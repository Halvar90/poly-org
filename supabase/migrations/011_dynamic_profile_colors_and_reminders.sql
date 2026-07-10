-- Ensure profile color changes are reflected everywhere and add separate reminders list.

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  creator_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reminders_title_not_empty CHECK (char_length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS reminders_creator_id_idx ON public.reminders (creator_id);
CREATE INDEX IF NOT EXISTS reminders_is_done_idx ON public.reminders (is_done);
CREATE INDEX IF NOT EXISTS reminders_created_at_idx ON public.reminders (created_at DESC);

DROP TRIGGER IF EXISTS reminders_set_updated_at ON public.reminders;
CREATE TRIGGER reminders_set_updated_at
BEFORE UPDATE ON public.reminders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reminders lesen (eingeloggt)" ON public.reminders;
CREATE POLICY "Reminders lesen (eingeloggt)"
ON public.reminders FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Reminders anlegen" ON public.reminders;
CREATE POLICY "Reminders anlegen"
ON public.reminders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Eigene Reminders bearbeiten" ON public.reminders;
CREATE POLICY "Eigene Reminders bearbeiten"
ON public.reminders FOR UPDATE
TO authenticated
USING (auth.uid() = creator_id)
WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Eigene Reminders loeschen" ON public.reminders;
CREATE POLICY "Eigene Reminders loeschen"
ON public.reminders FOR DELETE
TO authenticated
USING (auth.uid() = creator_id);

CREATE OR REPLACE VIEW public.reminders_with_creator AS
SELECT
  r.id,
  r.title,
  r.description,
  r.creator_id,
  r.is_done,
  r.created_at,
  r.updated_at,
  p.username AS creator_username,
  p.color_code AS color_code
FROM public.reminders r
JOIN public.profiles p ON p.id = r.creator_id;

REVOKE ALL ON public.reminders_with_creator FROM PUBLIC;
GRANT SELECT ON public.reminders_with_creator TO authenticated;

-- Make color display dynamic: use current profile color in event view.
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
  p.profile_icon AS creator_profile_icon
FROM public.events e
JOIN public.profiles p ON p.id = e.creator_id;

REVOKE ALL ON public.events_with_creator FROM PUBLIC;
GRANT SELECT ON public.events_with_creator TO authenticated;
