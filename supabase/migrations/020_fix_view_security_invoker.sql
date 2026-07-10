-- Kritischer Fund: Views ohne "security_invoker" pruefen RLS mit den Rechten
-- des View-Eigentuemers (i.d.R. ein privilegierter Rollen-Owner ueber die
-- Migrations-Verbindung), NICHT mit den Rechten des abfragenden Nutzers.
-- events_with_creator hat dadurch saemtliche Events an JEDEN (auch anonyme
-- Requests ohne gueltige Session) ausgeliefert - unabhaengig von den in
-- 018 gesetzten Haushalts-RLS-Policies. security_invoker = true erzwingt,
-- dass die View mit den Rechten/RLS des abfragenden Nutzers laeuft
-- (Standard-Empfehlung seit Postgres 15).

ALTER VIEW public.events_with_creator SET (security_invoker = true);
ALTER VIEW public.reminders_with_creator SET (security_invoker = true);
ALTER VIEW public.notes_with_creator SET (security_invoker = true);
