import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** Online unless the phone is sure it is not (unknown counts as online, so syncs still try). */
export function isOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * Calls `onReconnect` each time the phone goes from offline to online, so
 * changes made offline are sent as soon as they can be.
 */
export function onReconnect(onReconnect: () => void): () => void {
  let wasOnline = true;
  return NetInfo.addEventListener((state) => {
    const online = isOnline(state);
    if (online && !wasOnline) {
      onReconnect();
    }
    wasOnline = online;
  });
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((state) => setOnline(isOnline(state))), []);
  return online;
}
