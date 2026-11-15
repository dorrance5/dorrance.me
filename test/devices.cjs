// The owner's iPhone Duo screen sizes, defined once. Measured in iOS Safari on 2026-11-14 (real device, toolbars showing).
// This file is the only place to change them: every app's flows.cjs and shots.cjs require it.
// width x height is the page's window.innerWidth x innerHeight in CSS px, DPR 3.
//   closed: folded shut, upright
//   open: unfolded, upright          openSideways: unfolded, turned
//   split: the open screen upright with another app beside this one (each gets about half of the width)
// Do NOT use screen.width/height: Safari reports 466x678 for every pose.
const duo = {
  closed: { width: 382, height: 588 },
  open: { width: 669, height: 735 },
  openSideways: { width: 951, height: 601 },
  split: { width: 385, height: 579 }
};

// closed sideways is not tested; the owner doesn't use it (2026-11-15)
// Reference size only: { width: 594, height: 466 }, safe-area bottom inset 34.

// Screen pixels per CSS pixel.
const deviceScaleFactor = 3;

// Safe-area insets in CSS px (top, right, bottom, left; omitted = 0), as measured. Playwright cannot emulate env()
// insets, so these are only recorded here.
const insets = {
  closed: {},
  open: {},
  openSideways: { top: 14, bottom: 34 },
  split: {}
};

// Keyboard up in Safari, measured for the poses where it appears. pageHeight is window.innerHeight (the layout
// viewport, a little shorter than without the keyboard), visibleHeight is visualViewport.height, offsetTop is
// visualViewport.offsetTop (how far iOS has panned the page). width is the pose's width from duo.
const keyboard = {
  closed: { width: 382, pageHeight: 561, visibleHeight: 306, offsetTop: 250 },
  open: { width: 669, pageHeight: 735, visibleHeight: 435, offsetTop: 100 },
  openSideways: { width: 951, pageHeight: 599, visibleHeight: 253, offsetTop: 304 }
};

module.exports = { duo, deviceScaleFactor, insets, keyboard };
