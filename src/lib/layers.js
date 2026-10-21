// Single z-index scale for the whole app. Lowest to highest:
//   page content < full-screen pages < spot overlay < bottom nav <
//   sheets/popups < confirmation dialogs < toasts
//
// Tiers are spaced 10,000 apart so a component that needs fine-grained
// order against its own siblings (two badges stacked on one card, a
// toggle pill's own thumb vs. its labels) can still do
// LAYERS.<TIER> + 1, + 2, ... without ever reaching into the next tier.
//
// Every bottom sheet, popup, modal, and confirmation dialog in the app
// renders through createPortal(..., document.body) at SHEET or CONFIRM —
// never below BOTTOM_NAV, on any screen.
export const LAYERS = {
  PAGE_CONTENT: 1,
  FULL_SCREEN_PAGE: 10000,
  SPOT_OVERLAY: 20000,
  BOTTOM_NAV: 30000,
  SHEET: 40000,
  CONFIRM: 50000,
  TOAST: 60000,
}
