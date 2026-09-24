import { Alert, Platform } from 'react-native';

/** Placeholder for buttons whose feature is planned but not built yet. */
export function comingSoon(feature: string) {
  const message = `Coming in a future update: ${feature}.`;
  if (Platform.OS === 'web') {
    window.alert(`Coming soon\n\n${message}`);
    return;
  }
  Alert.alert('Coming soon', message);
}

/** Asks before replacing or erasing data. */
export function confirmAction(
  title: string,
  message: string,
  actionLabel: string,
  action: () => Promise<void> | void,
) {
  const run = () => Promise.resolve(action()).catch(() => undefined);
  if (Platform.OS === 'web') {
    // Alert buttons are not supported on web.
    if (window.confirm(`${title}\n\n${message}`)) {
      run();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: run },
  ]);
}
