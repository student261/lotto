# INVENTORY.md — LottoTrack Pro System Controls & Role Inventory

Comprehensive functional registry of every interactive element in the LottoTrack Pro POS web application (`C:\Users\Admin\OneDrive\Documents\lotto`).
Audited across all 4 operational roles: **Owner**, **Shift Manager**, **Cashier**, and **Salesperson**.

---

## 1. Role Definitions & Access Boundaries

| Role | Primary Identity / Clerks | Access Scope & Authorizations | Manager PIN Modal Required? |
| :--- | :--- | :--- | :--- |
| **Owner** | Maulik (`maulik`), Admin (`admin`), master | **Full System Access:** Inventory, activate/move/remove books, settings, store switches, role assignment, clear data, manual overrides, system resets. | **No** (Acts as authorizer; can approve any prompt) |
| **Shift Manager** | Carlos (`carlos`) | **Operational Authority:** Start/close shifts, activate/move packs, update inventory, approve cashier overrides and position adjustments via Manager PIN. | **No** (Can enter PIN to authorize staff actions) |
| **Cashier** | Priya (`priya`), Luis (`luis`) | **Counter Sales:** Scan sales barcodes, activate packs (prompts manager PIN if unprivileged), close own shift, view own shift totals. | **Yes** (Required for pack removals, box reassignments, report corrections) |
| **Salesperson** | Rosa (`rosa`), Daniel (`daniel`), Kevin (`kevin`) | **Restricted Clerk:** Start and close shift, scan boxes at shift end, view basic shift totals. Cannot change prices, move stock, access Inventory or Settings. | **Yes** (Strictly blocked from administrative functions; empty slot tap is no-op) |

---

## 2. Global Shell & Navigation Elements

| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#sidebarLogoToggle` | Button / Click | All Roles | Expands or collapses the left navigation rail between 200px and 68px. | No | `localStorage.lottotrack_sidebar_collapsed` |
| `#navSellCounter` | Nav Tab / Button | All Roles | Activates `viewSellCounter` (Sell Counter Dashboard). Sets active class on nav item. | No | Session runtime view state |
| `#navReceivePacks` | Nav Tab / Button | Owner, Manager, Cashier | Opens `viewReceivePacks` (Receive / Activate Book flow). Salesperson sees read-only warning or gated prompt. | Optional | Session runtime view state |
| `#navInventory` | Nav Tab / Button | Owner, Manager | Switches to `viewInventory` (Live Pack Table & Safe Inventory). Hidden / disabled for Salesperson. | No | Session runtime view state |
| `#navDayReport` | Nav Tab / Button | All Roles | Switches to `viewDayReport` (Day Report, print, PDF export, corrections). | No | Session runtime view state |
| `#navHistory` | Nav Tab / Button | All Roles | Switches to `viewHistory` (Past shifts, daily archives, report reprint). | No | Session runtime view state |
| `#navSettings` | Nav Tab / Button | Owner Only | Switches to `viewSettings`. Requires admin authorization (`requireAdminAuth`). | No | Session runtime view state |
| `#themeToggleBtn` | Button / Toggle | All Roles | Toggles `[data-theme]` between `'light'` and `'dark'`. Updates icon and styles. | No | `localStorage.lotto_theme` |
| `#storeSwitcherSelect` | Select / Dropdown | Owner, Manager | Switches active retail location (e.g. Amigo Food Mart vs Downtown Quick Mart). Saves `lotto_current_store_id` and reloads store state. | No | `localStorage.lotto_current_store_id`, `lotto_track_pos_data_v3_${storeId}` |
| `#sidebarUserCard` / `#btnSignOut` | Button / Action | All Roles | Sets `sessionStorage.lotto_signed_out = 'true'`, clears current clerk session, displays `viewSignIn`. | No | `sessionStorage.lotto_signed_out` |

---

## 3. Screen 01: Sign In & Authentication (`viewSignIn`)

| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#signInUsername` | Input (Text) | All Roles | Clerk or Owner username / sign-in handle. | No | Session runtime |
| `#signInPassword` | Input (Password) | All Roles | PIN or password credential (accepts user PIN; Admins/Owners also accept master key '1234' or 'admin'). | No | Authenticated via `findUserByCredentials` |
| `#btnTogglePassword` | Button / Eye | All Roles | Toggles `#signInPassword` type between `password` and `text`. | No | None |
| `#btnSubmitSignIn` | Button (Primary) | All Roles | Validates credentials; sets `state.cashierName` and user role; clears `sessionStorage.lotto_signed_out`; navigates to Sell Counter. | No | `lotto_track_pos_data_v3`, `sessionStorage` |
| `#quickClerkMaulik` | Button (Chip) | Owner | Quick-fills username `maulik` and PIN for rapid POS sign in. | No | None |
| `#quickClerkRosa` | Button (Chip) | Salesperson | Quick-fills username `rosa` and PIN for shift handover. | No | None |
| `#quickClerkCarlos` | Button (Chip) | Manager | Quick-fills username `carlos` and PIN for supervisor access. | No | None |
| `#quickClerkPriya` | Button (Chip) | Cashier | Quick-fills username `priya` and PIN. | No | None |
| `#quickClerkKevin` | Button (Chip) | Salesperson | Quick-fills username `kevin` (routed to Downtown store). | No | None |

---

## 4. Screen 02: Sell Counter Dashboard (`viewSellCounter`)

### 4.1 Header Bar & KPI Stat Chips
| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#cashierNameBadge` | Chip / Display | All Roles | Shows active logged-in clerk name. Tapping allows fast role/clerk switch. | No | `state.cashierName` |
| `#shiftNumberBadge` | Chip / Display | All Roles | Displays current shift sequence number (e.g. "Shift #13"). | No | `state.shiftNumber` |
| `#shiftStatusPill` | Chip / Badge | All Roles | Indicates current shift state (`IN_PROGRESS`, `CLOSED`). | No | `state.shiftStatus` |
| `#statActiveBoxes` | Metric Chip | All Roles | Shows count of active dispenser boxes with loaded packs. | No | Computed from `state.slots` |
| `#statPackValue` | Metric Chip | All Roles | Total retail inventory value currently mounted in dispenser rack. | No | Computed from `state.slots` |
| `#statTodaySold` | Metric Chip | All Roles | Total dollar sales accumulated across current shift. | No | Computed from `state.slots` sold |
| `#statScannedCount` | Metric Chip | All Roles | Number of boxes scanned during End Shift closing cycle. | Yes (in close mode) | Session `s.scannedInEndShift` |
| `#statInactiveCount` | Metric Chip | All Roles | Count of empty or unassigned dispenser boxes. Click opens inactive list. | No | Computed from `state.slots` |

### 4.2 Scanner Input & Last-Scan Readout
| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#barcodeInput` | Input (Hidden) | All Roles | **CRITICAL FROZEN ZONE.** Captures hardware keyboard-wedge scans, GS1-128, ITF, and manual barcodes. Auto-refocused. | **YES (Primary)** | Processes barcode into state |
| `#lastScannedBoxCard` | Panel / Card | All Roles | Live feedback card displaying game name, box number, ticket number, and price from most recent scan. | Yes | `state.lastScanned` |
| `#scannerStatusIndicator`| Badge | All Roles | Visual pulse indicator confirming scanner wedge readiness. | No | UI DOM state |

### 4.3 Command Action Buttons
| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#btnEndShift` | Button (Dark Ink)| All Roles | Initiates End Shift verification mode. Turns tiles into scan targets. Shows floating toast `#endShiftScanningToast`. | **Yes (Scan targets)** | `state.isEndShiftScanning = true` |
| `#btnCancelEndShift` | Button | All Roles | Exits End Shift mode. Cancels scanning. Restores normal counter view. | No | `state.isEndShiftScanning = false` |
| `#btnGetReport` | Button (Primary) | All Roles | Opens "Check before closing" modal (`#endShiftConfirmModal`) with totals & variance. | No | UI modal state |
| `#btnOpenReceive` | Button | Owner, Manager | Opens Receive Packs view to log new packs from shipment. | Optional | Navigates view |
| `#btnOpenReport` | Button | All Roles | Opens live Shift Report view. | No | Navigates view |
| `#endShiftScanningToastOK`| Button | All Roles | Dismisses the floating scanner instructions toast. | No | `display: none` on toast |

### 4.4 65-Box Dispenser Rack Grid
| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#box-tile-${i}` (1..65) | Interactive Tile | All Roles | Displays Box #, Price, Game Name, and Current Ticket #. Color-coded (green=active, blue=activated this shift, grey=empty). | Yes (in close mode) | `state.slots[i]` |
| *Tap on Active Tile* | Tile Click | All Roles | Opens `#boxAdjustModal` (Box Details). Allows Owner to move or remove; Cashier/Salesperson view-only. | No | Opens modal |
| *Tap on Empty Tile* | Tile Click | Owner, Manager | Opens `#setBoxModal` pre-populated with clicked box number to activate new book. (Salesperson click is no-op). | Optional | Opens activation flow |
| `#bottomBoxStrip` | 65-Slot Strip | All Roles | Mini-map representation of rack. Tapping slot mirrors box tile click. | No | Reads `state.slots` |

---

## 5. Screen 03: Receive Packs & Box Assignment (`viewReceivePacks`)

| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#receiveBarcodeInput` | Input (Scan/Text)| Owner, Manager, Cashier | Captures barcode of new book to be received into store inventory. | **YES** | Parsed into pack metadata |
| `#recGameId` | Input (Text) | Owner, Manager | 4-digit game identification number. Auto-filled from scan. | Optional | `state.inventory` |
| `#recPackNum` | Input (Text) | Owner, Manager | 6- or 7-digit pack serial number. Auto-filled from scan. | Optional | `state.inventory` |
| `#recStartTicket` | Input (Number) | Owner, Manager | Starting ticket index (typically `000`). | No | `state.inventory` |
| `#recPriceChips` ($1..$50)| Chips (Group) | Owner, Manager | Price tier selection chips. Automatically computes total pack value. | No | Pack model |
| `#recKeypad` (0-9, Back, Clear)| Virtual Keypad | Owner, Manager | On-screen numeric entry for touchscreen POS terminals. | No | Injects value into active input |
| `#btnSaveToSafe` | Button | Owner, Manager | Places pack into Safe Inventory (Back Inventory) without placing in rack. | No | `state.safeInventory[]`, MySQL sync |
| `#btnAssignToBox` | Button (Primary) | Owner, Manager | Moves to Step 2: Assign pack directly to an empty dispenser box in the rack. | No | `state.slots[]`, `state.inventory[]` |
| `#btnCancelReceive` | Button | All Roles | Aborts book intake and returns to sell counter. | No | None |

---

## 6. Screen 04: Inventory & Safe Storage (`viewInventory`)

| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#invTabAll` | Tab Button | Owner, Manager | Displays all inventory items (Active rack, Safe storage, Sold out). | No | Filter state |
| `#invTabActive` | Tab Button | Owner, Manager | Filters table to only active dispenser rack packs. | No | Filter state |
| `#invTabSafe` | Tab Button | Owner, Manager | Filters table to unactivated safe packs. | No | Filter state |
| `#invTabSold` | Tab Button | Owner, Manager | Filters table to depleted/archived packs. | No | Filter state |
| `#invSearchInput` | Input (Search) | Owner, Manager | Live search by Game ID, Game Title, or Pack Serial Number. | No | UI filter state |
| `#btnAddNewBook` | Button (Primary) | Owner, Manager | Opens `#setBoxModal` / `#receivePackModal` to log new shipment. | Optional | Navigates / modal |
| `#btnUpdateInventoryScan`| Button | Owner, Manager | Activates batch inventory audit scanner mode. | **YES** | Audits `state.inventory` |
| `#btnExportInventoryCSV` | Button | Owner, Manager | Downloads full CSV dump of current retail store inventory. | No | File export |

---

## 7. Screen 05: Reports & History (`viewHistory` & `viewDayReport`)

| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#historyDateChips` | Chips (Group) | All Roles | Quick date filters (Today, Yesterday, Last 7 Days, Custom Date). | No | Date filter state |
| `#btnPrevDay` / `#btnNextDay`| Stepper Buttons| All Roles | Steps active report date forward or backward by one business day. | No | `state.reportDate` |
| `#btnPrintShiftReport` | Button (Action) | All Roles | Opens browser print dialog formatted for A4 shift report. | No | Print layout |
| `#btnPrintDayReport` | Button (Action) | All Roles | Generates 210mm A4 Daily Summary document across all shifts for day. | No | Print layout |
| `#btnEmailReport` | Button (Action) | Owner, Manager | Sends shift PDF to configured owner email (requires MySQL/API backend). | No | `POST /api/send-report` |
| `#btnCorrectThisReport` | Button (Warning)| Owner, Manager | Opens Report Correction modal (`#correctReportModal`). Cashiers require manager PIN. | No | `state.corrections[]` |
| `#btnReconcileTerminal` | Button | Owner, Manager | Opens cash drawer reconciliation dialog (Cashes, Online, Lottery Sales). | No | `state.reconciliation` |

---

## 8. Screen 06: Close Shift Workflows (`#endShiftConfirmModal` & `viewCloseShift`)

### 8.1 Dashboard Close Modal (`#endShiftConfirmModal`)
| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#endShiftTerminalCashes` | Input (Currency)| All Roles | Cash paid out to winning lottery tickets on the terminal. | No | `shift.terminalCashes` |
| `#endShiftOnlineSales` | Input (Currency)| All Roles | Online lottery terminal sales (Powerball, Mega Millions). | No | `shift.onlineSales` |
| `#endShiftOnlineCashes` | Input (Currency)| All Roles | Online lottery terminal cashes paid out. | No | `shift.onlineCashes` |
| `#endShiftCountedCash` | Input (Currency)| All Roles | Actual physical currency counted in POS cash drawer. | No | `shift.countedCash` |
| `#endShiftConfirmSubmit`| Button (Primary) | All Roles | Verifies calculations, closes shift, computes shift variance, creates archive record in `state.shiftHistory`, advances `state.shiftNumber`. | No | `lotto_track_pos_data_v3`, MySQL `pos_shifts` |
| `#endShiftConfirmCancel`| Button | All Roles | Cancels closing modal and returns to Sell Counter. | No | None |

### 8.2 Full Close Shift Page (`viewCloseShift`)
| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#csRowNoChange_${id}` | Button (Row) | All Roles | Marks box as verified with no tickets sold during shift. | No | `slot.scannedInEndShift = true` |
| `#csRowSoldOut_${id}` | Button (Row) | All Roles | Marks pack in box as completely sold out; clears slot for next shift. | No | `slot.soldOut = true` |
| `#csRowRescan_${id}` | Button (Row) | All Roles | Clears closing scan for box to allow fresh scan. | **YES** | Clears `slot.scannedInEndShift` |
| `#csRowFixTicket_${id}` | Button (Row) | Owner, Manager | Opens manual ticket position fix modal. Prompts manager PIN if cashier. | No | Updates `slot.currentTicket` |
| `#btnCloseShiftGetReport`| Button (Primary)| All Roles | Enabled when all boxes are verified; advances to Final Close Summary. | No | Advances close step |

---

## 9. Screen 07: Settings & Store Configuration (`viewSettings`)

| UI Control / ID | Element Type | Role Access | Description & State Changed | Scanner Needed? | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#settingsTabStore` | Tab Button | Owner Only | Store address, retailer license, phone number, manager email recipient. | No | `lotto_stores_list` |
| `#settingsTabBoxes` | Tab Button | Owner Only | Total dispenser boxes in rack (stepper controls 1 to 70 boxes). | No | `state.totalBoxes`, `state.slots[]` |
| `#settingsTabGames` | Tab Button | Owner Only | Lottery games catalog (Game ID, name, ticket price, tickets per pack). | No | `state.gameCatalog[]` |
| `#settingsTabPeople` | Tab Button | Owner Only | Staff accounts, assigned roles, PIN numbers, active/inactive switches. | No | `state.settingsPeopleList`, `state.clerks` |
| `#settingsTabDatabase`| Tab Button | Owner Only | MySQL / XAMPP server connection status, sync button, and diagnostic log. | No | MySQL config |
| `#btnSaveSettings` | Button (Primary) | Owner Only | Persists modified configuration across storage and updates active layout. | No | `lotto_track_pos_data_v3`, `localStorage` |
| `#btnClearAllData` | Button (Danger) | Owner Only | Destructive factory reset. Requires typing confirmation code + Master PIN. | No | Clears `localStorage` keys |

---

## 10. Modals, Drawers & Approval Overlays

| Modal / Overlay ID | Trigger Function | Role Gating | Description & Controls | Persistence / Storage |
| :--- | :--- | :--- | :--- | :--- |
| `#boxAdjustModal` | `openBoxAdjustModal(slot)` | All (Edit gated) | Box Details drawer. Displays active pack metadata. Owner can click "Change Box" or "Remove Book". Cashiers view read-only stats. | Updates `state.slots` |
| `#changeBoxModal` | `openChangeBoxModal(slot)` | Owner, Manager | Selects destination empty box to move an active pack. Updates slot indexes. | Updates `state.slots` |
| `#returnPackModal` | `openReturnPackModal(slot)` | Owner, Manager | Removes book from dispenser rack with reason (Discontinued, Returned, Damaged, Back to Safe). | Updates `state.slots`, `state.safeInventory` |
| `#fixTicketPositionModal`| `openFixTicketPositionModal(slot)`| Owner, Manager | Corrects misaligned ticket number. Requires Manager PIN if triggered by Cashier. | Updates `slot.currentTicket` |
| `#managerApprovalModal` | `openManagerApprovalModal(opts)` | All (Target: Mgr)| 4-digit PIN authorization keypad. Unlocks restricted operations for clerks. | Evaluates `REFERENCE_MODERN_SETTINGS_PEOPLE` PINs |
| `#modalShiftReportSheet` | `openShiftReportModal()` | All Roles | Full-screen A4 printable shift report preview with breakdown of all 65 boxes. | Read-only render |
| `#correctReportModal` | `openReportCorrectionModal()` | Owner, Manager | Adjustment dialog for past reports: adjustments to cash, terminal cashes, tickets. | Persists to `state.shiftHistory` |
| `#mysqlStatusModal` | Click `#mysqlStatusBadge` | All Roles | Diagnostics modal showing MySQL host, port, active database, and connection error. | Read-only render |
