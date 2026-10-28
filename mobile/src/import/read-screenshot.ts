/**
 * Reads the text in a picture on the phone itself — the image never leaves the
 * device. Uses expo-text-extractor: Apple Vision on iPhone, Google ML Kit on
 * Android. Both work offline and are free.
 *
 * The module is native code, so it is in development and release builds but not
 * in Expo Go; it is loaded only when used so the rest of the app still opens there.
 */
import { toLines } from './screenshot-parser';

type TextExtractor = {
  isSupported: boolean;
  extractTextFromImage: (uri: string) => Promise<string[]>;
};

function loadTextExtractor(): TextExtractor | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module: TextExtractor = require('expo-text-extractor');
    return module.isSupported ? module : null;
  } catch {
    return null;
  }
}

/** False in Expo Go and on the web, where the text reader is not available. */
export function canReadScreenshots(): boolean {
  return loadTextExtractor() !== null;
}

/** The lines of text in the picture at `uri`, top to bottom. */
export async function readScreenshotText(uri: string): Promise<string[]> {
  const extractor = loadTextExtractor();
  if (!extractor) {
    throw new Error('Reading screenshots needs the full app build; it does not work in Expo Go.');
  }
  return toLines(await extractor.extractTextFromImage(uri));
}
