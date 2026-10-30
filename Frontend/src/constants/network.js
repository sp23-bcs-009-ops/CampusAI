import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

const DEFAULT_HOST = '127.0.0.1';

function cleanHost(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.includes('://')) {
      const parsed = new URL(trimmed.replace(/^exp:/i, 'http:'));
      return parsed.hostname || null;
    }
  } catch {
    // Fall through to the host:port form Expo uses, such as 192.168.1.5:8081.
  }

  return trimmed.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '') || null;
}

function isLoopback(host) {
  return !host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
}

function getEnv(name) {
  if (typeof process === 'undefined' || !process.env) return null;
  return process.env[name] || null;
}

function getHostFromExpo() {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.linkingUri,
  ];
  for (const candidate of candidates) {
    const host = cleanHost(candidate);
    if (host && !isLoopback(host)) return host;
  }
  return null;
}

function getHostFromMetro() {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (!scriptURL || typeof scriptURL !== 'string') return null;
  const match = scriptURL.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/([^/:?]+)/);
  const host = cleanHost(match?.[1]);
  return host && !isLoopback(host) ? host : null;
}

function getHostFromWeb() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return cleanHost(window.location.hostname);
}

export function getDevHost() {
  return (
    getHostFromExpo() ||
    getHostFromMetro() ||
    getHostFromWeb() ||
    cleanHost(getEnv('EXPO_PUBLIC_API_HOST')) ||
    DEFAULT_HOST
  );
}

export function getServerUrl(port, envOverrideName) {
  const override = getEnv(envOverrideName);
  if (override) return override.replace(/\/$/, '');

  // Port-prefixed proxy hosts (e.g. cloud previews: "19006-abc.host.app")
  // → swap the port prefix instead of appending ":port".
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    const m = hostname.match(/^(\d+)-(.+)$/);
    if (m && protocol === 'https:') {
      return `https://${port}-${m[2]}`;
    }
  }

  return `http://${getDevHost()}:${port}`;
}

export const getAiServerUrl = () => getServerUrl(8000, 'EXPO_PUBLIC_AI_SERVER_URL');
export const getTimetableServerUrl = () => getServerUrl(3000, 'EXPO_PUBLIC_TIMETABLE_SERVER_URL');
