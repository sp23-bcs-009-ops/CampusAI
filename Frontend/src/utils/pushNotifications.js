import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let permissionRequest;

export function ensureNotificationPermissionAsync() {
  if (Platform.OS === 'web') {
    return Promise.reject(new Error('Notifications are only supported on Android and iOS.'));
  }
  if (permissionRequest) return permissionRequest;

  permissionRequest = (async () => {
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
    return permission.status === 'granted';
  })().finally(() => {
    permissionRequest = null;
  });
  return permissionRequest;
}
