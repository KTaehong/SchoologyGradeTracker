/**
 * Where the Schoology calendar link is kept. The link works like a password
 * (anyone with it can read the student's calendar), so on phones it lives in
 * secure storage (Keychain / Keystore). The web build has no secure storage
 * and falls back to the browser's local storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'schoology_calendar_feed_url';

export async function readCalendarLink(): Promise<string | null> {
  return Platform.OS === 'web' ? AsyncStorage.getItem(KEY) : SecureStore.getItemAsync(KEY);
}

export async function saveCalendarLink(url: string): Promise<void> {
  if (Platform.OS === 'web') await AsyncStorage.setItem(KEY, url);
  else await SecureStore.setItemAsync(KEY, url);
}

export async function forgetCalendarLink(): Promise<void> {
  if (Platform.OS === 'web') await AsyncStorage.removeItem(KEY);
  else await SecureStore.deleteItemAsync(KEY);
}
