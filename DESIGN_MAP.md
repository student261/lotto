# DESIGN_MAP.md — Master Redesign Mapping & Token Specification

Comprehensive design bridge mapping each mockup screen in `lotto-agent-pack/design/screens/` to its corresponding live production screen in LottoTrack Pro.

---

## 1. Extracted Design Tokens (from `tokens-and-components.css`)

### 1.1 Color Tokens (Light vs Dark)
| Token Variable | Light Value | Dark Value | Semantic Purpose / Usage |
| :--- | :--- | :--- | :--- |
| `--bg` | `#F3F4F6` | `#0E1115` | App canvas background |
| `--surface` | `#FFFFFF` | `#161A20` | Cards, sidebars, headers, table rows |
| `--surface-2` | `#F1F3F6` | `#1C2128` | Hover states, secondary panels, inputs |
| `--surface-3` | `#E7EAEF` | `#252B34` | Nested containers, inactive chips, borders |
| `--line` | `#E1E5EB` | `#272D36` | Subdued borders and dividers |
| `--line-strong`| `#C9CFD8` | `#38404B` | Prominent borders, active card strokes |
| `--ink` | `#14171C` | `#EEF1F5` | Primary body text and headers |
| `--ink-2` | `#47505C` | `#B7BFCA` | Secondary subtitles, table headers, labels |
| `--ink-3` | `#66707D` | `#8F98A5` | Placeholder text, timestamps, muted counts |
| `--brand` | `#1D4ED8` | `#6B97FF` | Primary action buttons, active tabs |
| `--brand-hover`| `#1A43BC` | `#86AAFF` | Hover state on brand actions |
| `--brand-soft` | `#E9EFFD` | `#18233D` | Active nav pill background, subtle highlight |
| `--brand-ink`  | `#1E3A8A` | `#B9CDFF` | Text on brand-soft pills |
| `--on-brand`   | `#FFFFFF` | `#0A1430` | High-contrast text on solid brand buttons |
| `--money`      | `#0A7A42` | `#45D08B` | Active boxes, money badges, positive metrics |
| `--money-soft` | `#E4F4EA` | `#11291C` | Active box pill background |
| `--money-strong`| `#08663A`| `#6FE0A6` | High-emphasis monetary values |
| `--warn`       | `#A9530A` | `#F2A93B` | Inactive box chips, warnings |
| `--warn-soft`  | `#FDF1E1` | `#2E2210` | Inactive chip background |
| `--danger`     | `#C0261B` | `#FF6F63` | Errors, sold out, destructive actions |
| `--danger-soft`| `#FCEBE9` | `#371614` | Error alert backgrounds |
| `--scrim`      | `rgba(17,22,30,.45)` | `rgba(0,0,0,.60)` | Modal backdrop tint |

### 1.2 Radii, Typography, Elevation & Motion
- **Font Stack:** Figtree (`--font: "Figtree", ui-sans-serif, system-ui, sans-serif`) for UI and typography; JetBrains Mono (`--mono: "JetBrains Mono", monospace`) for pack serials, ticket positions, and barcodes.
- **Base Metrics:** 15px base font size, line-height 1.45.
- **Radii:** `--r-sm: 8px`, `--r-md: 12px`, `--r-lg: 16px`, `--r-pill: 999px`.
- **Shadows:**
  - Light: `--sh-sm: 0 1px 3px rgba(22,32,52,.08)`, `--sh-md: 0 4px 10px rgba(22,32,52,.08)`, `--sh-lg: 0 24px 48px rgba(22,32,52,.22)`.
  - Dark: `--sh-sm: 0 1px 2px rgba(0,0,0,.4)`, `--sh-md: 0 4px 12px rgba(0,0,0,.35)`, `--sh-lg: 0 24px 48px rgba(0,0,0,.6)`.
- **Transitions:** `--ease: cubic-bezier(.2, .7, .2, 1)`, rise animations 300–350ms, pop 240ms.

---

## 2. Screen-by-Screen Mapping & Data Contract

| Design Mockup File | Live Screen / View Replaced | CSS Values & Layout Patterns to Copy | Data Fields & Logic to Preserve (FROZEN) |
| :--- | :--- | :--- | :--- |
| **`Sidebar.dc.html`** | `.pos-sidebar` (Global Shell) | Width: 236px (expanded) / 76px (mini rail). Brand mark 36x36px with 10px radius. Nav items 44px min-height, 12px icon gap. Theme toggle and user card at bottom. | `lottotrack_sidebar_collapsed`, `lotto_theme`, `sessionStorage.lotto_signed_out`. Keep auto-collapse rule (Phase 2d). |
| **`Main.dc.html`** | `#viewSellCounter` (Sell Counter Dashboard) | 60px action buttons (`--font: Figtree 600`), rounded rectangle stat cards (`--r-md`), 65-box tile layout with 4px border-radius, top color stripe (green = active, blue = new activation). | `#barcodeInput` (focus & wedge logic), `state.slots[]`, `state.shiftNumber`, `state.cashierName`, `state.lastScanned`. Do NOT copy mockup's fake scan chips. |
| **`Login.dc.html`** | `#viewSignIn` (Sign In Screen) | 2-column split canvas. Left: Brand artwork + 4-step workflow overview. Right: Clean sign-in form card with 16px radius, floating input styles. | Quick Clerks buttons (Maulik, Rosa, Carlos, Priya, Kevin), PIN verification, store auto-routing. |
| **`ShiftReport.dc.html`**| `#viewDayReport` & `#modalShiftReportSheet` | 210mm A4 print layout, `@page { size: A4; margin: 0; }`, 48 rows per page table, header banner with Amigo Food Mart retailer license, dual-column summary footer. | Ticket position math (`currentTicket - startTicket`), pack sizes ($300 standard), expected sales formulas, variance tracking. |
| **`Inventory.dc.html`** | `#viewInventory` (Pack Table & Safe Storage) | Filter pill tabs (`--surface-2`), sticky table header (`--surface`), search input with search icon, "Add Book" button in top-right. | Safe inventory arrays (`state.safeInventory[]`), pack status flags, MySQL inventory sync. |
| **`CloseShift.dc.html`**| `#viewCloseShift` (Full Close Shift Page) | Per-box status table with action chips (No change, Sold out, Keep N, Rescan). Fixed bottom summary bar with Counted Cash input and Over/Short calculation. | Unscanned box preservation rule (do NOT force sold out), manager PIN approval, cash reconciliation math. |
| **`History.dc.html`** | `#viewHistory` (Past Shifts & Daily Archive) | Date pill selector, archive data table with sortable columns, report preview modal drawer with retry button. | Shift history arrays (`state.shiftHistory[]`), PDF download hooks, email resend dispatch. |
| **`Settings.dc.html`** | `#viewSettings` (Store Config & People) | Tabbed navigation (Store & Email, Boxes, Games, People). Form groups with 8px radius inputs, toggle switches, stepper controls. | Admin authorization (`requireAdminAuth`), `DEFAULT_STORES`, `lotto_stores_list`, clerk PIN management. |

---

## 3. Live Features With No Design Mockup

Per Owner Decision, these screens and features will be restyled using the new tokens (`tokens-and-components.css`) while strictly preserving existing live layout and business logic:

1. **Dashboard Close Modal (`#endShiftConfirmModal`):** Live "Check before closing" modal with terminal cashes, online sales, online cashes, and cash variance.
2. **Manager Approval PIN Modal (`#managerApprovalModal`):** 4-digit security PIN keypad for clerk overrides.
3. **Box Adjustment & Removal Drawers (`#boxAdjustModal`, `#returnPackModal`):** Move pack to another empty box or remove book with reason (Damaged, Discontinued, Returned).
4. **Ticket Position Fix Drawer (`#fixTicketPositionModal`):** Manual adjustment of misaligned ticket numbers.
5. **Day Report Correction Modal (`#correctReportModal`):** Audit adjustments to past shift sales, cashes, and cash drawer counts.
6. **Voice-Guided Session Drawer:** Voice assistance for blind or hands-free scanning.
7. **Store #402 Receipt Slip Prototype:** Formatted 80mm thermal receipt printer preview.
8. **MySQL / XAMPP Diagnostics Modal (`#mysqlStatusModal`):** Real-time database connection test and schema validation status.

---

## 4. Mockup Elements With No Live Feature (Do Not Build)

1. **"Scan Next Box" and "Try a scan" demo chips:** Mockup interactive demo widgets that bypass the hardware scanner.
2. **Mockup Runtime:** `<x-dc>`, `sc-if`, `sc-for`, `dc-import`, `DCLogic`, and `support.js`.
3. **Settings "Count down" ticket numbering:** Would break lottery position and sales math.
4. **Mockup Unscanned-as-Sold-Out Calculation:** Flawed mockup logic that forces `close = size`.

---

## 5. Wording Conflicts Resolution

Per the Owner's explicit instructions, **live wording is strictly preserved**:

| Mockup Term (Rejected) | Live Term (Preserved) | Context / Location |
| :--- | :--- | :--- |
| *Cashes / Online Cashes* | **Confirm** | Settlement modal / reconciliation buttons |
| *Ending Count* | **Closing Count** | Shift close and report tables |
| *Back Inventory* | **Safe Inventory** | Unactivated books in storage |
| *Check before closing the shift*| **Check before closing** | Close Shift verification prompt |
| *Sign in with Name + Password* | **Quick Clerks + PIN** | Fast login bar on sign-in screen |
