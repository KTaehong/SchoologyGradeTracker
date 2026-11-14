/** Space left between the kept-visible item and the keyboard. */
export const REVEAL_MARGIN = 16;

/**
 * Where to scroll so an item (its top and bottom, measured from the top of the
 * form) shows in the part of the form above the keyboard. `null` when it is
 * already in view. A tall item is aligned by its top.
 */
export function revealOffset({
  top,
  bottom,
  viewport,
  scrollY,
}: {
  top: number;
  bottom: number;
  viewport: number;
  scrollY: number;
}): number | null {
  const visibleTop = scrollY;
  const visibleBottom = scrollY + viewport;
  if (top >= visibleTop && bottom + REVEAL_MARGIN <= visibleBottom) {
    return null;
  }
  if (bottom - top + REVEAL_MARGIN > viewport) {
    return Math.max(0, top - REVEAL_MARGIN);
  }
  if (top < visibleTop) {
    return Math.max(0, top - REVEAL_MARGIN);
  }
  return Math.max(0, bottom + REVEAL_MARGIN - viewport);
}
