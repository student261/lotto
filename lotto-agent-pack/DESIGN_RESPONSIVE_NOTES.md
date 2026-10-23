# DESIGN_RESPONSIVE_NOTES.md

Responsive weaknesses in the MOCKUP, plus a starter contract and test matrix for the real app.
The mockup's responsive approach is a starting point to extend, not to copy. Confidence tags: **Read** =
seen in source, **Likely** = follows from CSS, not rendered, **Estimate** = arithmetic, verify with a render.

## 1. What the mockup does well (keep the idea)
- Auto-fit / auto-fill grids with `minmax` (rack tiles `minmax(132px,1fr)`, keypad `minmax(0,1fr)`).
- CSS variables for light and dark; `prefers-reduced-motion` honoured.
- Tables sit inside `overflow-x:auto` wrappers; popups keep header and footer fixed while the body scrolls.
- Print CSS with `@page{size:A4;margin:0}` and page breaks.

## 2. Weaknesses (Read unless noted)

| # | Finding | Where |
|---|---|---|
| R1 | Every screen is locked to the viewport above 820px: `.d-app,.d-main{height:100vh;overflow:hidden}` (same pattern `e-`, `i-`, `h-`, `s-`). Only the inner list scrolls. On short windows or 150-200% zoom the fixed header, controls and strip take most of the height. (Estimate) | All app screens |
| R2 | `100vh` used 5 times in the shared CSS and 3 times on each main app screen (once each in Login and Sidebar); `dvh`/`svh` never used. Mobile browser chrome will break it. | Shared CSS + screens |
| R3 | Sidebar has inline `min-height:100vh`; below ~820px it becomes a top bar, so it can end up a full screen tall above the content. (Likely) | Sidebar.dc.html |
| R4 | Breakpoints are few: 820 (all), 900 (Close Shift, Inventory), 1100 (Dashboard), plus `max-height:640` only for popup padding. Nothing for heights, large screens, or 1440+ ultra-wide (no max-width was seen on the Dashboard content). | Shared CSS + screens |
| R5 | Bottom box strip `repeat(33,1fr)` until 820px: about 18px wide cells at a 900px window. (Estimate) | Main `.slots` |
| R6 | Dashboard top area is a 3-column grid `minmax(0,1fr) 150px minmax(0,.9fr)` (120px / .8fr under 1100px) with a 76px number and fixed 60px buttons; 6 filter buttons stay in one row until 820px, fixed 60px high. Text will clip or wrap. (Likely) | Main `.ctl`, `.fgrid` |
| R7 | All font sizes are px; no rem or `clamp()`. Browser text-size settings will not scale text. | All |
| R8 | Fixed widths: box-number input `font-size:65px` inline; keypad popup `min(900px,100%)` with a 380px keypad column; Receive popup `min(1000px,100%)` with a 280px column. | Main, Inventory |
| R9 | `position:sticky` used only for two table headers (Close Shift, Inventory); the app shell relies on nested scroll areas. | CloseShift, Inventory |
| R10 | A4 report is a fixed 210mm; on narrow screens it scrolls sideways inside its panel. With a 70-row sample, page 2 may overflow to a third printed page. (Likely; needs a print test) | ShiftReport |
| R11 | Inline colour overrides bypass tokens (see DESIGN_ISSUES.md #9), so theme and contrast break at some sizes/modes. | Screens |

## 3. Starter RESPONSIVE_CONTRACT.md (agent to refine after auditing the live app)

1. **Never lock the page to the viewport.** Use `min-height:100dvh`; let the page scroll when content does not fit. Inner scroll areas allowed only for long lists, and they need a minimum height (suggest at least 240px).
2. **Controls never hide or overlap.** At any supported size the scan field, End Shift / Start Shift / Get Report, Cancel/Undo and the last-scan panel are fully visible without horizontal scroll.
3. **Tap targets at least 44 x 44 CSS px** for anything touched (tiles, slots, chips, row buttons, keypad). Where too many items exist (box strip), switch layout (fewer columns, wrap, or two rows) instead of shrinking.
4. **Text scales.** Sizes in rem, with `clamp()` for large numbers (box number, last-scan number). Layout must survive 200% browser zoom and larger OS text size.
5. **Grids use `auto-fill/auto-fit` with `minmax`.** No fixed column counts without a breakpoint that rescues them.
6. **Tables** sit in an `overflow-x:auto` wrapper with sticky headers; no page-level horizontal scroll.
7. **Popups** never exceed the viewport: header and footer fixed, body scrolls, buttons reachable at 600px height; the box-number popup must still show input + Add button.
8. **Long and extreme data wraps or truncates with a title**, never breaks layout: 40-character game names, 3-digit box numbers, $50 prices, 4-digit totals, 70 boxes, Spanish strings if approved.
9. **Safe areas and notches** respected (`env(safe-area-inset-*)`).
10. **Print** layout is independent of screen size.
11. Nothing here may change scan input focus, type, inputmode or handlers.

## 4. Test matrix (starter)

- Widths: 320, 360, 390, 414, 768, 820, 900, 1024, 1100, 1280, 1366, 1440, 1536, 1600, 1920, 2560, 3440.
- Heights: 600, 640, 720, 768, 900, 1080.
- Zoom: 80%, 100%, 125%, 150%, 175%, 200%.
- Themes: light and dark. Roles: Owner and Salesperson.
- States per screen: shift open / none; End Shift scanning; every popup open; Update Inventory; report view; empty data; extreme data (70 boxes, long names, large totals).
- Assertions: no horizontal page scroll; no element outside the viewport that is unreachable by scroll; tap targets >= 44px; key controls visible; no text clipped for key numbers; popup fits; screenshots stored per combination.
- Scanning golden tests run unchanged on every phase (see ANTIGRAVITY_PROMPT.md, Phase 0).

## 5. Lint and enforcement ideas

- Stylelint: ban `100vh`/`100vw` for layout (allow `dvh`), ban `px` font sizes, ban `!important` and inline `style=` colour values, require tokens for colours.
- ESLint/CI check: no inline `style` with hex colours in templates.
- Playwright matrix above as a required CI job; fail on horizontal overflow and on tap targets under 44px.
- A short `RESPONSIVE_CONTRACT.md` linked from `AGENTS.md`, so every future change is held to it.
