# RESPONSIVE_AUDIT.md — Live System Responsive & Breakpoint Audit

Comprehensive audit of layout integrity, short-height viewport behavior, zoom scaling, and theme contrast across the live LottoTrack Pro application.

---

## 1. Audit Methodology & Test Execution

- **Dev Server:** `http://localhost:5173` (Vite)
- **Engine:** Real Chromium / Chrome automation via DevTools Protocol (CDP) WebSocket commands.
- **Evaluated Dimensions:**
  - **Widths:** 320px, 360px, 390px, 430px, 768px, 820px, 1024px, 1180px, 1276px, 1280px, 1366px, 1440px, 1536px, 1680px, 1920px, 2560px, 3440px.
  - **Heights:** 556px, 600px, 640px, 720px, 768px, 900px, 1080px.
  - **Zoom Levels:** 80%, 100%, 125%, 150%, 175%, 200%.
  - **Color Schemes:** Light Mode (`[data-theme="light"]`) and Dark Mode (`[data-theme="dark"]`).
- **Screenshots Generated:** Saved to conversation artifact directory `screenshots/`.

---

## 2. Primary Required Checkpoint Captures

Baseline screenshots captured at the mandatory test viewports:

| Screen Name | Viewport | Theme | Screenshot File | Layout & Contrast Status |
| :--- | :--- | :--- | :--- | :--- |
| **Sell Counter (Dashboard)** | 1276 x 556 | Light | `Dashboard_SellCounter_light_1276x556.png` | **Defect:** Rack clipped by `max-height: 295px !important`. |
| **Sell Counter (Dashboard)** | 1276 x 556 | Dark | `Dashboard_SellCounter_dark_1276x556.png` | **Defect:** Sidebar forced white; tile numbers dark-on-dark. |
| **Sell Counter (Dashboard)** | 1920 x 1080 | Light | `Dashboard_SellCounter_light_1920x1080.png` | Functional; large dead space below rack. |
| **Sell Counter (Dashboard)** | 1920 x 1080 | Dark | `Dashboard_SellCounter_dark_1920x1080.png` | **Defect:** White sidebar contrast break (`#ffffff !important`). |
| **Inventory View** | 1276 x 556 | Light | `Inventory_light_1276x556.png` | Table body scrolls; table header sticky. |
| **Inventory View** | 1276 x 556 | Dark | `Inventory_dark_1276x556.png` | Contrast legible; sidebar remains white. |
| **Day Report View** | 1276 x 556 | Light | `DayReport_light_1276x556.png` | Report sheet scrolls vertically. |
| **Day Report View** | 1920 x 1080 | Dark | `DayReport_dark_1920x1080.png` | Dark background with white report sheet container. |
| **Close Shift Page** | 1276 x 556 | Light | `CloseShift_Page_light_1276x556.png` | 65-box review table requires vertical scroll. |
| **Close Shift Page** | 1920 x 1080 | Dark | `CloseShift_Page_dark_1920x1080.png` | Action buttons visible; table header sticky. |
| **Settings View** | 1276 x 556 | Light | `Settings_light_1276x556.png` | Tabs visible; requires scrolling on short heights. |
| **Sign In Screen** | 1276 x 556 | Light | `SignIn_Screen_light_1276x556.png` | 2-column layout centers card; fits without scroll. |

---

## 3. Detailed Failure Log & Root Cause Analysis

### Break #1: Sidebar Forced White in Dark Mode
- **Affected Viewports:** All widths and heights in Dark Mode (`[data-theme="dark"]`).
- **Defect Symptom:** The navigation sidebar remains bright white (`#ffffff`), while typography, user card, and icons shift to light colors, resulting in severe contrast failure and invisible text.
- **Exact Code Location:** [src/responsive.css:1724-1736](file:///c:/Users/Admin/OneDrive/Documents/lotto/src/responsive.css#L1724-L1736)
  ```css
  .pos-sidebar {
    width: 200px !important;
    min-width: 200px !important;
    max-width: 200px !important;
    background: #ffffff !important;
    border-right: 1px solid #e2e8f0 !important;
  }
  ```
- **Root Cause:** Hardcoded `background: #ffffff !important` in `responsive.css` (which is loaded after `design-system.css`) unconditionally overrides the dark mode token `var(--surface)`.
- **Target Fix (Phase 3):** Bind background to `var(--surface)` / `var(--bg-card)` or provide explicit `[data-theme="dark"] .pos-sidebar { background: #161A20 !important; }`.

---

### Break #2: Dispenser Tile Numbers Dark-on-Dark in Dark Mode
- **Affected Viewports:** Sell Counter Dashboard rack tiles at all screen sizes in Dark Mode.
- **Defect Symptom:** Dispenser box number and ticket countdown numbers render as `#0f172a` (nearly black) against dark card backgrounds, making box numbers unreadable.
- **Exact Code Location:** [src/responsive.css:2282-2288](file:///c:/Users/Admin/OneDrive/Documents/lotto/src/responsive.css#L2282-L2288)
  ```css
  .sell-counter-view .box-card .box-main-number {
    font-size: 42px !important;
    font-weight: 800 !important;
    color: #0f172a !important;
    line-height: 1 !important;
    margin: 4px 0 !important;
  }
  ```
- **Root Cause:** Forced ink color `#0f172a !important` overrides `var(--text-main)` / `var(--ink)`.
- **Target Fix (Phase 3):** Replace `#0f172a !important` with `var(--ink)` or add dark theme override `[data-theme="dark"] .sell-counter-view .box-card .box-main-number { color: #EEF1F5 !important; }`.

---

### Break #3: Dispenser Rack Clipped at Short Viewport Heights (540px–600px)
- **Affected Viewports:** 1276x556, 1280x540, 1366x600.
- **Defect Symptom:** The 65-box dispenser rack is severely cut off vertically. Cashiers cannot see the full 5 rows of dispenser boxes without scrolling through a small 295px inner box.
- **Exact Code Location:** [src/style.css:20388-20393](file:///c:/Users/Admin/OneDrive/Documents/lotto/src/style.css#L20388-L20393)
  ```css
  .dispensers-grid-wrapper {
    max-height: 295px !important;
    overflow-y: scroll !important;
    overflow-x: hidden !important;
    padding: 2px 6px 2px 0 !important;
  }
  ```
- **Root Cause:** Rigid `max-height: 295px !important` declaration ignores available viewport height.
- **Target Fix (Phase 3):** Calculate dynamic flexbox distribution (`flex: 1 1 auto; max-height: none; min-height: 0;`) allowing the rack grid to expand to fill available height.

---

### Break #4: End-Shift Toast Stuck Over Dispenser Rack
- **Affected Viewports:** End Shift verification mode across all viewports, especially short heights (< 640px).
- **Defect Symptom:** Tapping the "OK" button on `#endShiftScanningToast` does not dismiss the toast. The toast floats directly over boxes 50–65, blocking scan targets.
- **Exact Code Locations:**
  - [index.html:616](file:///c:/Users/Admin/OneDrive/Documents/lotto/index.html#L616):
    ```css
    .end-shift-floating-toast {
      display: flex !important;
      ...
    }
    ```
  - [src/style.css:20754](file:///c:/Users/Admin/OneDrive/Documents/lotto/src/style.css#L20754):
    ```css
    display: flex !important;
    ```
- **Root Cause:** When JavaScript executes `toast.style.display = 'none'`, the CSS stylesheet rule `display: flex !important` has higher specificity, rendering the dismissal inoperative.
- **Target Fix (Phase 2a):** Remove `!important` from `display: flex` in both files so inline style `display: none` succeeds.

---

### Break #5: Rigid Viewport Locking (`100vh`) on Mobile & Zoom
- **Affected Viewports:** Widths 320px–768px; Browser Zoom 150%–200%.
- **Defect Symptom:** On mobile browsers where dynamic address bars collapse and expand, `100vh` causes bottom buttons (End Shift, Save, Submit) to be pushed below the fold and cut off.
- **Exact Code Location:** [src/responsive.css:78-85](file:///c:/Users/Admin/OneDrive/Documents/lotto/src/responsive.css#L78-L85)
- **Root Cause:** Legacy `height: 100vh` rather than `min-height: 100dvh` paired with `overflow: hidden` on container roots.
- **Target Fix (Phase 6):** Adopt `min-height: 100dvh` and container query rules.

---

### Break #6: Hardcoded 60px Button Heights & Unscaled Typographic Metrics
- **Affected Viewports:** Zoom 175%–200% and narrow tablet viewports (768px–1024px).
- **Defect Symptom:** Fixed height buttons (`height: 60px !important`) clip two-line button text or push adjacent controls into horizontal overflow.
- **Root Cause:** Fixed pixel dimensions (`height: 60px`, `width: 200px`) instead of `min-height` and `rem`/`clamp()`.
