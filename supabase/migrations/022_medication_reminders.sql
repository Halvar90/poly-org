-- Medikamenten-Erinnerungen: eigene Uhrzeit + Wiederholungsintervall (in Tagen,
-- deckt "taeglich" (1), "alle zwei Tage" (2) usw ab). Mehrfach-taegliche Einnahme
-- wird durch mehrere Zeilen mit unterschiedlicher time_of_day abgebildet.
-- Ein Hintergrund-Job (siehe Migration 023) prueft periodisch faellige
-- Erinnerungen und verschickt Push-Benachrichtigungen, die sich wiederholen,
-- bis die Einnahme im Erinnerungen-Tab bestaetigt wurde.

CREATE TABLE public.medication_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  time_of_day TIME NOT NULL,
  interval_days INT NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_confirmed_date DATE,
  last_notified_at TIMESTAMPTZ,
  last_notify_date DATE,
  notify_count_today INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT medication_reminders_name_not_empty CHECK (char_length(trim(medication_name)) > 0),
  CONSTRAINT medication_reminders_interval_positive CHECK (interval_days >= 1)
);

CREATE INDEX medication_reminders_creator_id_idx ON public.medication_reminders (creator_id);
CREATE INDEX medication_reminders_active_idx ON public.medication_reminders (is_active) WHERE is_active = true;

CREATE TRIGGER medication_reminders_set_updated_at
BEFORE UPDATE ON public.medication_reminders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.medication_reminders ENABLE ROW LEVEL SECURITY;

-- Haushaltsmitglieder duerfen mitlesen (z.B. um zu sehen, ob eingenommen wurde),
-- aber nur der/die Ersteller:in darf anlegen/aendern/loeschen/bestaetigen.
CREATE POLICY "Eigene oder Haushalts-Medikamente lesen"
ON public.medication_reminders FOR SELECT
TO authenticated
USING (auth.uid() = creator_id OR public.same_household(creator_id));

CREATE POLICY "Medikamenten-Erinnerung anlegen"
ON public.medication_reminders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Eigene Medikamenten-Erinnerung bearbeiten"
ON public.medication_reminders FOR UPDATE
TO authenticated
USING (auth.uid() = creator_id)
WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Eigene Medikamenten-Erinnerung loeschen"
ON public.medication_reminders FOR DELETE
TO authenticated
USING (auth.uid() = creator_id);
