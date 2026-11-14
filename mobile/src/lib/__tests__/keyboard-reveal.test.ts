import { describe, expect, it } from '@jest/globals';

import { REVEAL_MARGIN, revealOffset } from '../keyboard-reveal';

describe('revealOffset', () => {
  it('leaves an item that is already in view', () => {
    expect(revealOffset({ top: 100, bottom: 150, viewport: 400, scrollY: 0 })).toBeNull();
  });

  it('scrolls a button hidden behind the keyboard up into view', () => {
    // The keyboard shrank the form to 300 pt; the button sits at 500–550.
    expect(revealOffset({ top: 500, bottom: 550, viewport: 300, scrollY: 0 })).toBe(
      550 + REVEAL_MARGIN - 300,
    );
  });

  it('scrolls back down to an item above the visible part', () => {
    expect(revealOffset({ top: 40, bottom: 90, viewport: 300, scrollY: 200 })).toBe(40 - REVEAL_MARGIN);
  });

  it('shows the top of an item taller than the space', () => {
    expect(revealOffset({ top: 400, bottom: 800, viewport: 300, scrollY: 0 })).toBe(400 - REVEAL_MARGIN);
  });

  it('never scrolls above the top', () => {
    expect(revealOffset({ top: 5, bottom: 30, viewport: 300, scrollY: 100 })).toBe(0);
  });
});
