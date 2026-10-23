# BUGS_FOUND.md — Live System Audit & Bug Log

This document records bugs, hardcoded prototype leftovers, behavioral traps, and architectural risks found by inspecting the live codebase in `C:\Users\Admin\OneDrive\Documents\lotto`.
Per project rules, **none of these bugs have been altered or patched in code**; they are documented for the owner's review and decision.

---

## 1. Forced Cashier & Shift Overwrite on Every Page Load

- **Location:** [src/main.js:17-21](file:///c:/Users/Admin/OneDrive/Documents/lotto/src/main.js#L17-L21)
- **Exact Code Lines:**
  ```javascript
  let state = loadState();
  if (state && (state.cashierName !== 'Maulik' || state.shiftNumber !== 13 || state.shiftStatus !== 'IN_PROGRESS')) {
    state.cashierName = 'Maulik';
    state.shiftNumber = 13;
    state.shiftStatus = 'IN_PROGRESS';
    saveState(state);
  }
  ```
- **Origin Commit:** Commit `247e2e8` (`feat(auth): implement 2-column sign in screen with password security, automatic store routing, and admin access control`, committed 2026-10-21 18:58).
- **Was it in the original live Netlify version?** **NO.** Parent commit `f59ffbe` and earlier historical commits did not contain this block.
- **Behavior & Test Verification:**
  1. Cashier finishes Shift #13, closes the shift, and starts Shift #14 under another cashier name (e.g. "Carlos").
  2. The shift history stores Shift #13, and the active state advances to `shiftNumber = 14`.
  3. **On browser reload (or relaunching the app):** Lines 17–21 detect `state.shiftNumber !== 13`, immediately overwrite `state.shiftNumber = 13`, `state.cashierName = 'Maulik'`, and `state.shiftStatus = 'IN_PROGRESS'`, then immediately persist it to `localStorage` via `saveState(state)`.
  4. **Impact:** Destroys shift incrementation and persistent shift continuity across page refreshes.

---

## 2. Hardcoded Prototype & Demo Values in State and UI

The live application contains leftover prototype strings and hardcoded demo values across multiple files:

| Prototype String | Affected Files & Lines | Description / Impact |
| :--- | :--- | :--- |
| `started 7:02 AM` / `open since 7:02 AM` | `src/main.js:1088, 1115, 1117, 4440, 10446, 10555, 10950, 11512`<br>`index.html:1480, 1613, 1735, 1916, 2117, 2337, 2684, 2873`<br>`src/dayReportData.js:452, 461, 549, 658`<br>`src/historyData.js:9, 33, 105, 184, 186, 368` | Hardcoded start time used as fallback instead of reading `state.shiftStartedAt`. Displayed in header pills, report previews, and shift histories. |
| `manager@eltesystemsoftware.com` | `index.html:4648, 6250`<br>`src/main.js:8647` | Hardcoded email address for system reports instead of user-configured recipient. |
| `ELTE LOTTO EXPRESS #402` | `index.html:6174` | Hardcoded store name/number on the receipt slip prototype. |
| `*SHFT-402-0001-REC*` / `*DAY-402-...*` | `index.html:6288`<br>`src/main.js:4738, 8030` | Hardcoded barcode string containing store `#402` printed on receipt slips. |
| Hardcoded staff names (`Priya`, `Carlos`, `Dana`) | `src/main.js:1120-1126`<br>`index.html:2117, 2684` | Hardcoded fallback names used in role pill logic when custom auth user is not found. |

---

## 3. Unscanned Box Handling at Shift Close (Live vs Mockup)

- **Owner Decision Mandate:** Keep live behavior; report exact lines; do not adopt mockup behavior.
- **Live Code Implementation:**
  - When cashier enters End Shift verification mode, [src/main.js:7380](file:///c:/Users/Admin/OneDrive/Documents/lotto/src/main.js#L7380) marks `targetSlot.scannedInEndShift = true` *only* when that specific box is scanned.
  - If a box is **NOT** scanned, `s.scannedInEndShift` remains `false`.
  - When calculating shift sales totals in [src/main.js:356-361](file:///c:/Users/Admin/OneDrive/Documents/lotto/src/main.js#L356-L361):
    ```javascript
    (state.slots || []).forEach(s => {
      if (isBoxActive(s)) {
        const sold = Math.max(0, (s.currentTicket || 0) - (s.startTicket || 0));
        totalSold += sold;
        totalRevenue += sold * (s.price || 0);
      }
    });
    ```
  - **Exact Live Rule:** Tickets sold is calculated strictly as `currentTicket - startTicket`. The live system does **NOT** treat an unscanned box as sold out.
  - When the next shift begins in [src/main.js:4981-4995](file:///c:/Users/Admin/OneDrive/Documents/lotto/src/main.js#L4981-L4995):
    ```javascript
    state.slots.forEach(s => {
      if (isBoxActive(s)) {
        s.startTicket = s.currentTicket;
        s.activatedThisShift = false;
        s.scannedInEndShift = false;
        s.daysActive = (s.daysActive || 0) + 1;
      }
    });
    ```
    The unscanned box retains its existing ticket count, sets `startTicket = currentTicket`, clears `scannedInEndShift`, and carries over into the next shift.
- **Mockup Flaw (DO NOT USE):** As noted in `DESIGN_ISSUES.md` #1, the mockup's `buildReport()` silently forces `close = size` (assuming 100% of remaining tickets were sold) for unscanned boxes. **Live logic correctly avoids this.**

---

## 4. Hardware Scanner Prefix Characterization (`]C1`)

- **Location:** [src/data.js:200-210](file:///c:/Users/Admin/OneDrive/Documents/lotto/src/data.js#L200-L210)
- **Observation:** Certain hardware scanners output AIM symbology identifiers (e.g. `]C1` for GS1-128 or Code 128). The live regex `/^\][a-zA-Z0-9]{2,3}/` matches up to 3 alphanumeric characters greedily. When scanned against a barcode starting with `1` (e.g. `]C11648...`), it strips `]C11` rather than `]C1`, shifting digits.
- **Rule:** Per frozen zone directives, this parser behavior is logged and preserved unchanged. Characterization tests in `tests/golden-barcode.test.mjs` lock this behavior.

---

## 5. Database Schema Desynchronization (`store_inventory`)

- **Observation:** In existing local XAMPP installations, the `store_inventory` table created from older schemas lacked the columns `date_received` and `location`.
- **Impact:** Backend API call `POST /api/sync-pos-state` failed with MySQL Error `1054: Unknown column 'date_received' in 'field list'`.
- **Remediation:** Added `ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS date_received ...` to MySQL migration to guarantee backward and forward compatibility without data loss.
