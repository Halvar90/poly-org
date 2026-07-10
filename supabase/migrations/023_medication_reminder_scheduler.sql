-- Periodischer Job, der alle 2 Minuten prueft, ob Medikamenten-Erinnerungen
-- faellig sind, und die check-medication-reminders Edge Function aufruft.
-- Der Anon-Key hier ist bewusst kein Geheimnis - er ist ohnehin oeffentlich
-- im Web-Client eingebettet, die eigentliche Absicherung passiert ueber RLS
-- (die Edge Function nutzt den Service-Role-Key serverseitig).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'check-medication-reminders',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pphagrjtoljjwrpzepno.supabase.co/functions/v1/check-medication-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwaGFncmp0b2xqandycHplcG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNTQ2ODAsImV4cCI6MjA5NzgzMDY4MH0.J6a_xDtqWwre-DMWhoSENad-1J3UKxmIyXLKejcfDM8'
    ),
    body := '{}'::jsonb
  );
  $$
);
