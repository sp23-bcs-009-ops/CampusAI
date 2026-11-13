import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    throw new Error('Push notifications are only supported on Android and iOS.');
  }
  if (!Device.isDevice) {
    throw new Error('Push notifications require a physical device.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'CampusAI notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') return null;

  const token = await Notifications.getDevicePushTokenAsync();
  return { token: String(token.data), platform: Platform.OS };
}
