import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform, StyleSheet } from 'react-native';

import { showsAppleButton } from '@/lib/sign-in-providers';
import { Radius } from '@/theme/colors';
import { useResolvedColorScheme } from '@/theme/theme-preference';

/** Apple's official "Sign in with Apple" button, black in light mode and white in dark. Renders nothing off iPhone. */
export function AppleSignInButton({
  signUp = false,
  disabled = false,
  onPress,
}: {
  signUp?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const scheme = useResolvedColorScheme();
  if (!showsAppleButton(Platform.OS)) {
    return null;
  }
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={
        signUp
          ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
          : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
      }
      buttonStyle={
        scheme === 'dark'
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={Radius.small}
      style={[styles.button, disabled && styles.disabled]}
      onPress={() => {
        if (!disabled) {
          onPress();
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
  },
  disabled: {
    opacity: 0.7,
  },
});
