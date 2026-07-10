-- Households: echte Gruppierung für den bisher toten profiles.household_id-Verweis.
-- Nutzer erstellen einen Haushalt (Einladungscode) oder treten per Code einem bei.
-- Ermöglicht die "Für wen?"-Zuweisung + Push-Benachrichtigung in add-event.tsx.

CREATE TABLE public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT households_name_not_empty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT households_invite_code_format CHECK (invite_code ~ '^[A-Z0-9]{6}$')
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_household_id_idx ON public.profiles (household_id);

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

-- Jeder eingeloggte Nutzer darf Haushalte lesen (noetig, um per Einladungscode
-- beizutreten, bevor er Mitglied ist).
CREATE POLICY "Haushalte lesen (eingeloggt)"
ON public.households FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Haushalt erstellen"
ON public.households FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Eigenen Haushalt bearbeiten"
ON public.households FOR UPDATE
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);
