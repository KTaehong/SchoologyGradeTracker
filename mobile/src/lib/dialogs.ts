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

/** Runs a button's action and shows a message if it fails (instead of failing silently). */
export function runOrWarn(failureTitle: string, action: () => Promise<void> | void): void {
  Promise.resolve()
    .then(action)
    .catch((e: unknown) => showMessage(failureTitle, errorMessage(e)));
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

/** Asks a yes/no question. Resolves to whether the student chose `actionLabel`. */
export function askFirst(title: string, message: string, actionLabel: string, cancelLabel = 'Cancel'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: actionLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}
