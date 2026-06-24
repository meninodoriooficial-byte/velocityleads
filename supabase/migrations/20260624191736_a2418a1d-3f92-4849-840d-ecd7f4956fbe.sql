CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'crm-flow-run-every-minute' LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'crm-flow-run-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gtoifsgptdchbmupbkvi.supabase.co/functions/v1/crm-flow-run',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);