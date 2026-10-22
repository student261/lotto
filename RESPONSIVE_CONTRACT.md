# RESPONSIVE_CONTRACT.md — Responsive & Accessibility Contract

This document forms the binding architectural contract for LottoTrack Pro. Every future code modification, pull request, or agent session must comply with all 11 contract rules.

---

## 1. The 11 Invariant Rules

### Rule 1: Never Lock Page Roots to the Viewport
Use `min-height: 100dvh` on top-level application containers. Never use `height: 100vh` or `overflow: hidden` on root containers. The page must be allowed to scroll vertically whenever content exceeds available viewport height (particularly on short terminals < 640px height or at 150%–200% zoom).

### Rule 2: Minimum 44px Tap Targets
Every touch-interactive element (buttons, box tiles, ribbon slots, keypad keys, row actions, chips) must provide a tap target of at least **44 × 44 CSS pixels** (`min-height: 44px; min-width: 44px;`). When space is restricted, layouts must wrap or switch to grid/column arrangements rather than shrinking controls below 44px.

### Rule 3: Zero Horizontal Page Scroll
Under no circumstances may `document.documentElement.scrollWidth` exceed `window.innerWidth`. Horizontal scrolling is strictly prohibited at the page level across all supported widths (320px to 3440px). Data tables must reside within explicit `overflow-x: auto` wrappers with sticky headers.

### Rule 4: Text Fluidity & Zoom Scaling
- All typography must scale cleanly using `rem`, `em`, or `clamp()` formulas.
- Critical numerical readouts (box numbers, ticket counters, monetary sums) must use `clamp()` to scale without clipping or breaking parent boundaries.
- The layout must survive browser zoom levels between **80% and 200%** and 40% longer localized strings without text truncation or overlapping.

### Rule 5: Scanner Integrity Zone (Strictly Frozen)
The hardware scanner input (`#barcodeInput`), hidden focus mechanics, keyboard wedge listener, debouncing intervals, and inputmode/type attributes are permanently frozen. No CSS or responsive layout rule may hide, reposition, or alter focus handling on `#barcodeInput`.

### Rule 6: Fluid Auto-Fit Grids
Dispenser racks, action button clusters, and metric cards must use auto-fill/auto-fit grid layouts with minmax constraints (e.g. `grid-template-columns: repeat(auto-fill, minmax(132px, 1fr))`). Fixed column counts without rescue media queries are prohibited.

### Rule 7: Modal Reachability on Short Viewports
All modal dialogs (`<dialog>`, `.modal`, `.drawer`) must fit within the viewport at heights as short as **540px**:
- Header and action footer must remain sticky/fixed within the dialog.
- The modal body must scroll independently (`overflow-y: auto`).
- Action buttons ("Confirm", "Cancel", "Submit", "Reload") must always remain clickable without zooming out.

### Rule 8: Dark Mode Contrast Compliance
- All text and numerical displays must satisfy WCAG AA contrast standards (minimum 4.5:1 for normal text, 3:1 for large text).
- Hardcoded hex backgrounds (e.g. `#ffffff !important;`) on theme-sensitive surfaces (sidebar, cards, tables) are prohibited.
- All colors must derive from the design token system (`tokens-and-components.css`).

### Rule 9: Safe Areas & Hardware Insets
App margins must respect hardware notches, home indicator bars, and physical bezels using `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, etc.

### Rule 10: Dynamic Height Distribution for Dispenser Rack
On short heights (540px–600px), the dispenser rack container must maintain a minimum height of at least **200px** (`flex: 1 1 auto; min-height: 200px; max-height: none;`), ensuring cashiers can always see and tap the dispenser box tiles.

### Rule 11: Zero New `!important` Policy
New stylesheet additions must be structured with appropriate specificity rather than appending `!important`. Existing legacy `!important` declarations must be eliminated in place whenever touched.

---

## 2. Supported Test Matrix

| Axis | Range Tested & Enforced |
| :--- | :--- |
| **Widths** | 320, 360, 390, 430, 768, 820, 1024, 1180, 1276, 1280, 1366, 1440, 1536, 1680, 1920, 2560, 3440 px |
| **Heights** | 540, 556, 600, 640, 720, 768, 900, 1080 px |
| **Zoom** | 80%, 100%, 125%, 150%, 175%, 200% |
| **Color Themes** | Light Mode (`[data-theme="light"]`) and Dark Mode (`[data-theme="dark"]`) |
| **Data Extremes** | 0 active boxes, 65 active boxes, $1,234,567.00 monetary values, 30-char game titles |
