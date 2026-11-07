import { Alert, Platform } from 'react-native';

import { errorMessage } from '@/api/errors';

/** Shows a short message with an OK button. */
export function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}

${message}`);
    return;
  }
  Alert.alert(title, message);
}

/** Placeholder for buttons whose feature is planned but not built yet. */
export function comingSoon(feature: string) {
  const message = `Coming in a future update: ${feature}.`;
  if (Platform.OS === 'web') {
    window.alert(`Coming soon\n\n${message}`);
    return;
  }
  Alert.alert('Coming soon', message);
}

/** Asks before replacing or erasing data, and says so if it then fails. */
export function confirmAction(
  title: string,
  message: string,
  actionLabel: string,
  action: () => Promise<void> | void,
) {
  const run = () =>
    Promise.resolve()
      .then(action)
      .catch((e: unknown) => showMessage(`Could not ${actionLabel.toLowerCase()}`, errorMessage(e)));
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
