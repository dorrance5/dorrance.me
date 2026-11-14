// The owner's iPhone Duo screen sizes, defined once. Measured on the device 2026-11-14.
// width x height is Safari's CSS-pixel viewport for a page on his phone with the toolbars showing; the window is the
// screen before Safari's toolbars take their share (about 84 px of height). This file is the only place to change them:
// every app's flows.cjs and shots.cjs require it.
//   closed: folded shut, upright     closedSideways: folded shut, turned
//   open: unfolded, upright          openSideways: unfolded, turned
//   split: the open screen upright with another app beside this one (each gets about half of the width)
// The old closed (382x580) and closedSideways (594x368) were wrong: they took the toolbar off the width too.
const duo = {
  closed: { width: 466, height: 594 },          // window 466x678
  closedSideways: { width: 678, height: 382 },  // window 678x466
  open: { width: 669, height: 867 },            // window 669x951
  openSideways: { width: 951, height: 585 },    // window 951x669
  split: { width: 469, height: 585 }            // window 469x669
};

// Screen pixels per CSS pixel.
const deviceScaleFactor = 3;

// Safe-area insets in CSS px (top, right, bottom, left; omitted = 0), as measured. Playwright cannot emulate env()
// insets, so these are only recorded here.
const insets = {
  closed: { top: 24, right: 84, bottom: 34 },
  closedSideways: { top: 24, left: 84, bottom: 34 },
  open: { top: 82, bottom: 34 },
  openSideways: { top: 82, bottom: 34 },
  split: { top: 24, right: 84, bottom: 34 }
};

module.exports = { duo, deviceScaleFactor, insets };
