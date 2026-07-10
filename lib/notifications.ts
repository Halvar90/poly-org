import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as BufferSource;
}

// expo-notifications' web push implementation depends on Constants.expoConfig.notification
// (Expo strips the "notification" section from the web manifest at build time) and Expo's
// push relay doesn't accept "web" as a token type at all - confirmed directly against their
// API. So web subscribes via the standard browser Push API and stores the raw subscription;
// sendPushNotification() below routes it to our own send-web-push Edge Function instead of
// Expo's relay.
async function registerWebPushToken(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return;
  }

  const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return;

  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return;

  const registration = await navigator.serviceWorker.register('/expo-service-worker.js');
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  await supabase
    .from('profiles')
    .update({ expo_push_token: JSON.stringify(subscription.toJSON()) })
    .eq('id', userId);
}

export async function registerPushToken(userId: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await registerWebPushToken(userId);
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      // Kein EAS-Projekt verknuepft - Push-Tokens koennen noch nicht ausgestellt
      // werden. Sobald ein EAS-Projekt konfiguriert ist, greift dieser Guard nicht mehr.
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Standard',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    const finalStatus =
      existing === 'granted'
        ? existing
        : (await Notifications.requestPermissionsAsync()).status;

    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    await supabase
      .from('profiles')
      .update({ expo_push_token: tokenData.data })
      .eq('id', userId);
  } catch (err) {
    console.warn('Push-Token-Registrierung fehlgeschlagen:', err);
  }
}

export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    if (pushToken.startsWith('{')) {
      // Web push: pushToken is a JSON-serialized PushSubscription, not an Expo token.
      const subscription = JSON.parse(pushToken);
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      await fetch(`${supabaseUrl}/functions/v1/send-web-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey ?? '',
          Authorization: `Bearer ${anonKey ?? ''}`,
        },
        body: JSON.stringify({ subscription, title, body }),
      });
      return;
    }

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: pushToken, sound: 'default', title, body }),
    });
  } catch (err) {
    console.warn('Push-Benachrichtigung fehlgeschlagen:', err);
  }
}
