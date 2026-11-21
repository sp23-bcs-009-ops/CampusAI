import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermissionAsync } from './pushNotifications';
import { buildMyClassReminders } from './myClassSchedule';

let syncQueue = Promise.resolve();

function isCampusAiClassReminder(request) {
  return request.content?.data?.campusAiNotification === 'my-class';
}

async function syncMyClassNotificationsNow(options) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return { scheduled: 0, unsupportedPlatform: true };
  }

  const enabled = options.enabled !== false;
  const hasPermission = enabled ? await ensureNotificationPermissionAsync() : false;
  const reminders = enabled && hasPermission ? buildMyClassReminders(options) : [];
  const desired = new Map(reminders.map(reminder => [reminder.identifier, reminder]));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const managed = scheduled.filter(isCampusAiClassReminder);
  const kept = new Set();
  const cancellations = [];

  for (const request of managed) {
    const reminder = desired.get(request.identifier);
    const isCurrent = reminder
      && request.content?.data?.scheduledAtMs === reminder.scheduledAtMs
      && !kept.has(request.identifier);
    if (isCurrent) {
      kept.add(request.identifier);
    } else {
      cancellations.push(request.identifier);
    }
  }

  await Promise.all(cancellations.map(identifier =>
    Notifications.cancelScheduledNotificationAsync(identifier)
  ));

  if (!enabled) return { scheduled: 0, cancelled: cancellations.length };
  if (!hasPermission) return { scheduled: 0, cancelled: cancellations.length, permissionDenied: true };

  let scheduledCount = 0;
  for (const reminder of reminders) {
    if (kept.has(reminder.identifier)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.identifier,
      content: {
        title: reminder.title,
        body: reminder.body,
        sound: 'default',
        data: reminder.data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(reminder.scheduledAtMs),
        delivery: 'bestEffort',
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
      },
    });
    scheduledCount += 1;
  }

  return { scheduled: scheduledCount, cancelled: cancellations.length };
}

export function syncMyClassLocalNotifications(options) {
  const currentSync = syncQueue.then(() => syncMyClassNotificationsNow(options));
  syncQueue = currentSync.catch(() => undefined);
  return currentSync;
}
