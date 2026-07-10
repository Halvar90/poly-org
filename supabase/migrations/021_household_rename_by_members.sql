-- Haushaltsname soll von jedem Mitglied anpassbar sein, nicht nur vom
-- urspruenglichen Ersteller (der "Ersteller" ist ohnehin nur, wer zufaellig
-- zuerst auf "Haushalt erstellen" getippt hat).

DROP POLICY IF EXISTS "Eigenen Haushalt bearbeiten" ON public.households;

CREATE POLICY "Haushaltsmitglieder bearbeiten"
ON public.households FOR UPDATE
TO authenticated
USING (public.current_household_id() = id)
WITH CHECK (public.current_household_id() = id);
