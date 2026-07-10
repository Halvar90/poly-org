import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    // Kein EAS-Projekt verknuepft - Push-Tokens koennen noch nicht ausgestellt
    // werden. Sobald ein EAS-Projekt konfiguriert ist, greift dieser Guard nicht mehr.
    return;
  }

  try {
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
