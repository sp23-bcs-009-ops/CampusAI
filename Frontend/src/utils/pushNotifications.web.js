export function ensureNotificationPermissionAsync() {
  return Promise.reject(new Error('Local notifications are only supported in the mobile app.'));
}
