import { createDemoGradebook } from './demo';
import { type LoadResult } from './storage';
import { type Gradebook } from './types';

/**
 * Decides what the app shows at launch.
 * - First launch (nothing saved): the demo gradebook, so there is something to explore.
 * - A readable save: that save, even if it is empty because the student erased everything.
 * - A damaged save: the demo gradebook, flagged so the damaged copy is replaced.
 */
export function resolveInitialGradebook(
  result: LoadResult,
  now: Date = new Date(),
): { gradebook: Gradebook; needsSave: boolean } {
  if (result.kind === 'loaded') {
    return { gradebook: result.gradebook, needsSave: false };
  }
  return { gradebook: createDemoGradebook(now), needsSave: true };
}
