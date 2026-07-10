-- Bisher waren profiles/events/reminders/notes global fuer JEDEN eingeloggten
-- Nutzer sichtbar (USING (true)) - der Haushalt (017) steuerte nur die
-- Zuweisung/Push, nicht die eigentliche Datensichtbarkeit. Das wird hier
-- nachgeholt: sichtbar ist nur noch, was man selbst erstellt hat, oder was
-- von einem Mitglied des eigenen Haushalts stammt. Tagebuch bleibt bewusst
-- unveraendert (immer strikt privat, unabhaengig vom Haushalt).

CREATE OR REPLACE FUNCTION public.current_household_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT household_id FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_household_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.same_household(other_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.current_household_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = other_id AND p.household_id = public.current_household_id()
    );
$$;

REVOKE ALL ON FUNCTION public.same_household(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.same_household(uuid) TO authenticated;

DROP POLICY IF EXISTS "Profile lesen (eingeloggt)" ON public.profiles;
CREATE POLICY "Eigenes Profil oder Haushalt lesen"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.same_household(id));

DROP POLICY IF EXISTS "Events lesen (eingeloggt)" ON public.events;
CREATE POLICY "Eigene oder Haushalts-Events lesen"
ON public.events FOR SELECT
TO authenticated
USING (auth.uid() = creator_id OR public.same_household(creator_id));

DROP POLICY IF EXISTS "Reminders lesen (eingeloggt)" ON public.reminders;
CREATE POLICY "Eigene oder Haushalts-Reminders lesen"
ON public.reminders FOR SELECT
TO authenticated
USING (auth.uid() = creator_id OR public.same_household(creator_id));

DROP POLICY IF EXISTS "Notizen lesen (eingeloggt)" ON public.notes;
CREATE POLICY "Eigene oder Haushalts-Notizen lesen"
ON public.notes FOR SELECT
TO authenticated
USING (auth.uid() = creator_id OR public.same_household(creator_id));
