-- Gemeinsamer Notizzettel: alle eingeloggten Nutzer (Haushaltsmitglieder) sehen
-- alle Notizen, aber nur die eigenen bearbeiten/löschen.

CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  creator_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT notes_content_not_empty CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX notes_creator_id_idx ON public.notes (creator_id);
CREATE INDEX notes_created_at_idx ON public.notes (created_at DESC);

CREATE TRIGGER notes_set_updated_at
BEFORE UPDATE ON public.notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notizen lesen (eingeloggt)"
ON public.notes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Notizen anlegen"
ON public.notes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Eigene Notizen bearbeiten"
ON public.notes FOR UPDATE
TO authenticated
USING (auth.uid() = creator_id)
WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Eigene Notizen loeschen"
ON public.notes FOR DELETE
TO authenticated
USING (auth.uid() = creator_id);

CREATE OR REPLACE VIEW public.notes_with_creator AS
SELECT
  n.id,
  n.content,
  n.creator_id,
  n.created_at,
  n.updated_at,
  p.username AS creator_username,
  p.color_code AS color_code,
  p.profile_icon AS creator_profile_icon
FROM public.notes n
JOIN public.profiles p ON p.id = n.creator_id;

REVOKE ALL ON public.notes_with_creator FROM PUBLIC;
GRANT SELECT ON public.notes_with_creator TO authenticated;
