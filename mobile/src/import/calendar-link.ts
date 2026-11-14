/**
 * Where each account's Schoology calendar link is kept. The link works like a
 * password (anyone with it can read the student's calendar), so on phones it
 * lives in secure storage (Keychain / Keystore). The web build has no secure
 * storage and falls back to the browser's local storage.
 *
 * Each account has its own link, so a student who signs in on a phone someone
 * else used never gets that person's calendar.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Where versions before per-account links kept the one link for the phone. */
const LEGACY_KEY = 'schoology_calendar_feed_url';

/** The storage key for one account's link (letters, digits, `.`, `-`, `_` only). */
export function calendarLinkKey(accountId: string): string {
  return `${LEGACY_KEY}.${accountId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

const get = (key: string) =>
  Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
const remove = (key: string) =>
  Platform.OS === 'web' ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key);

export async function readCalendarLink(accountId: string): Promise<string | null> {
  return get(calendarLinkKey(accountId));
}

export async function saveCalendarLink(accountId: string, url: string): Promise<void> {
  const key = calendarLinkKey(accountId);
  if (Platform.OS === 'web') await AsyncStorage.setItem(key, url);
  else await SecureStore.setItemAsync(key, url);
}

export async function forgetCalendarLink(accountId: string): Promise<void> {
  await remove(calendarLinkKey(accountId));
}

/**
 * Forgets the one link older versions kept for the whole phone: nobody can
 * tell whose calendar it was. The student connects their calendar again.
 */
export async function forgetLegacyCalendarLink(): Promise<void> {
  await remove(LEGACY_KEY);
}
