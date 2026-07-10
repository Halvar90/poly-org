// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically provided to
// every Edge Function in the project - no manual secret needed for these two.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

webpush.setVapidDetails(
  "mailto:uwegerhards@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
  Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
);

const NAG_INTERVAL_MINUTES = 5;
const MAX_NOTIFY_COUNT_PER_DAY = 12;

type MedicationReminder = {
  id: string;
  creator_id: string;
  medication_name: string;
  time_of_day: string;
  interval_days: number;
  start_date: string;
  last_confirmed_date: string | null;
  last_notified_at: string | null;
  last_notify_date: string | null;
  notify_count_today: number;
  profiles: { expo_push_token: string | null } | null;
};

async function notify(
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
) {
  if (pushToken.startsWith("{")) {
    const subscription = JSON.parse(pushToken);
    await webpush.sendNotification(subscription, JSON.stringify({ title, body, data }));
  } else {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ to: pushToken, sound: "default", title, body, data }),
    });
  }
}

Deno.serve(async () => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowTime = now.toISOString().slice(11, 19);

  const { data: reminders, error } = await supabase
    .from("medication_reminders")
    .select(
      "id, creator_id, medication_name, time_of_day, interval_days, start_date, last_confirmed_date, last_notified_at, last_notify_date, notify_count_today, profiles(expo_push_token)",
    )
    .eq("is_active", true)
    .returns<MedicationReminder[]>();

  if (error) {
    console.error("Failed to load medication reminders:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;

  for (const r of reminders ?? []) {
    if (r.last_confirmed_date === today) continue;
    if (nowTime < r.time_of_day) continue;

    const daysSinceStart = Math.floor(
      (Date.parse(today) - Date.parse(r.start_date)) / 86_400_000,
    );
    if (daysSinceStart < 0 || daysSinceStart % r.interval_days !== 0) continue;

    const notifyCountToday = r.last_notify_date === today ? r.notify_count_today : 0;
    if (notifyCountToday >= MAX_NOTIFY_COUNT_PER_DAY) continue;

    if (r.last_notified_at && r.last_notify_date === today) {
      const elapsedMs = now.getTime() - Date.parse(r.last_notified_at);
      if (elapsedMs < NAG_INTERVAL_MINUTES * 60_000) continue;
    }

    const pushToken = r.profiles?.expo_push_token;
    if (!pushToken) continue;

    try {
      await notify(
        pushToken,
        `Medikament: ${r.medication_name}`,
        "Zeit für deine Medikamenteneinnahme. In der App als eingenommen bestätigen.",
        { type: "medication" },
      );
      sent++;
    } catch (err) {
      console.error(`Failed to notify for medication reminder ${r.id}:`, err);
    }

    await supabase
      .from("medication_reminders")
      .update({
        last_notified_at: now.toISOString(),
        last_notify_date: today,
        notify_count_today: notifyCountToday + 1,
      })
      .eq("id", r.id);
  }

  return Response.json({ checked: reminders?.length ?? 0, sent });
});
