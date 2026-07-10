// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";

webpush.setVapidDetails(
  "mailto:uwegerhards@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
  Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
);

// Called from the app with the project's anon key (same key used for every
// other Supabase call in this app - gated at the platform level by Supabase's
// own apikey requirement, no extra auth mode needed here).
//
// Expects the raw Web Push subscription JSON that was stored in
// profiles.expo_push_token for web clients (see lib/notifications.ts), not an
// Expo push token - Expo's own push relay does not support web push
// subscriptions.
Deno.serve(async (req) => {
  try {
    const { subscription, title, body } = await req.json();

    if (!subscription?.endpoint || !subscription?.keys) {
      return Response.json({ error: "Missing subscription" }, { status: 400 });
    }

    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title: title ?? "PolyOrg", body: body ?? "" }),
    );

    return Response.json({ ok: true });
  } catch (error) {
    console.error("send-web-push failed:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
});
