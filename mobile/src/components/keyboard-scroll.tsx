import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { revealOffset } from '@/lib/keyboard-reveal';
import { Spacing } from '@/theme/colors';

type Report = (y: number, height: number) => void;
const KeepVisibleContext = createContext<Report | null>(null);

/**
 * A scrolling form that stays usable with the keyboard up. The form shrinks to
 * the space above the keyboard, and whatever is wrapped in `KeepVisible` (the
 * form's main button) is scrolled into view when the keyboard opens, so the
 * student can always see and tap it.
 *
 * Android draws edge to edge, so the window no longer resizes for the
 * keyboard; `padding` makes room on both platforms.
 */
export function KeyboardScroll({
  children,
  contentContainerStyle,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const viewport = useRef(0);
  const scrollY = useRef(0);
  const target = useRef<{ y: number; height: number } | null>(null);
  const keyboardUp = useRef(false);

  const reveal = useCallback(() => {
    const keep = target.current;
    if (!keep || viewport.current <= 0) return;
    const offset = revealOffset({
      top: keep.y,
      bottom: keep.y + keep.height,
      viewport: viewport.current,
      scrollY: scrollY.current,
    });
    if (offset !== null) {
      scrollRef.current?.scrollTo({ y: offset, animated: true });
    }
  }, []);

  useEffect(() => {
    // The form has shrunk by the time the keyboard has finished opening.
    const show = Keyboard.addListener('keyboardDidShow', () => {
      keyboardUp.current = true;
      setTimeout(reveal, 50);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardUp.current = false;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal]);

  const report = useCallback<Report>(
    (y, height) => {
      target.current = { y, height };
      // An error appearing above the button pushes it down: follow it.
      if (keyboardUp.current) reveal();
    },
    [reveal],
  );

  return (
    <KeepVisibleContext.Provider value={report}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEventThrottle={32}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          onLayout={(e) => {
            viewport.current = e.nativeEvent.layout.height;
            if (keyboardUp.current) reveal();
          }}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </KeepVisibleContext.Provider>
  );
}

/**
 * Keeps its children (the form's main button) above the keyboard. Put it
 * directly inside `KeyboardScroll`, not inside another view, so its position
 * is measured from the top of the form.
 */
export function KeepVisible({ children }: { children: ReactNode }) {
  const report = useContext(KeepVisibleContext);
  return (
    <View
      style={styles.keep}
      onLayout={(e) => report?.(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  keep: {
    gap: Spacing.three,
  },
});
