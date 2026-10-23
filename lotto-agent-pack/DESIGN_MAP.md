# DESIGN_MAP.md

Starting point written from the mockup source only. The agent must extend it after inspecting the live app.
"Live counterpart" columns are placeholders to confirm, not facts.

## 1. Design files (`design/screens/`)

| File | Screen | Notes |
|---|---|---|
| Login.dc.html | 01 Sign in | Sign-in name + password (8+ chars). Left art panel with a 4-step flow. |
| Main.dc.html | 02 Dashboard | Shift controls, scan bar, last-scan panel, box tiles, bottom box strip, all popups, Update Inventory mode, embedded report. |
| ShiftReport.dc.html | 03 Shift Report (A4) | 210mm pages, 48 rows on page 1, totals, Inventory Stats, Activations, Sold. Also the emailed PDF. |
| Inventory.dc.html | 04 Inventory | Pack table with status tabs + search, Update Inventory scan panel, Receive Book popup with keypad. |
| History.dc.html | 05 Reports | Shift reports table, Daily report tab, report preview popup. |
| Settings.dc.html | 06 Settings | Tabs: Store & email, Boxes, Games, People. Owner only. |
| CloseShift.dc.html | End Shift page | Per-box table with status and fix buttons, confirm popup, report view. NOT in the original 02.zip. |
| Sidebar.dc.html | Component | Nav, theme toggle, user card, sign out, collapse to mini rail. |
| StyleGuide.dc.html | Design system | Colours, type, command buttons, box tile spec, status tags, motion. |
| tokens-and-components.css | Shared CSS | All tokens + components (light and dark). |

Not part of the design: mockup runtime, `support.js`, vendor files, sample data, "Try a scan" chips,
"Scan next box" button.

## 2. Tokens (from tokens-and-components.css)

| Token | Light | Dark |
|---|---|---|
| --bg | #F3F4F6 | #0E1115 |
| --surface / -2 / -3 | #FFFFFF / #F1F3F6 / #E7EAEF | #161A20 / #1C2128 / #252B34 |
| --line / --line-strong | #E1E5EB / #C9CFD8 | #272D36 / #38404B |
| --ink / -2 / -3 | #14171C / #47505C / #66707D | #EEF1F5 / #B7BFCA / #8F98A5 |
| --brand (action) | #1D4ED8 | #6B97FF |
| --brand-hover / -soft / -ink / --on-brand | #1A43BC / #E9EFFD / #1E3A8A / #FFFFFF | #86AAFF / #18233D / #B9CDFF / #0A1430 |
| --money (active, money) | #0A7A42 (soft #E4F4EA, strong #08663A) | #45D08B (soft #11291C, strong #6FE0A6) |
| --warn | #A9530A (soft #FDF1E1, line #F2C68A) | #F2A93B (soft #2E2210, line #6A4A16) |
| --danger | #C0261B (soft #FCEBE9) | #FF6F63 (soft #371614) |
| --hot / --old | #B3410E / #B4231A (+ soft) | #FF8A4C / #FF6F63 (+ soft) |
| Radii | --r-sm 8, --r-md 12, --r-lg 16, --r-pill 999 | same |
| Shadows | --sh-sm / --sh-md / --sh-lg | darker values |
| Fonts | Figtree (text), JetBrains Mono (pack, position numbers) | same |
| Base | 15px, line-height 1.45 | same |
| Motion | rise .3-.35s, pop .24s, scan flash once, reduced-motion respected | same |

Colour meaning: green = money and active boxes, blue = next action, red = problems only,
ink (near black) = End Shift.

## 3. Roles and navigation
Sidebar items: Dashboard, Inventory (Owner), Reports, Settings (Owner). Footer: theme toggle, user card, Sign out.
Collapses to a 76px rail. The mockup auto-collapses after 5 idle seconds (prop `autoCloseSeconds`, 0 disables).
Salesperson: no Inventory or Settings; cannot activate, move or remove books.

## 4. Tap map

| Screen | Tap | Result |
|---|---|---|
| Dashboard | Box tile | Box details popup. Owner: tabs Change box (pick empty box) and Remove book (position + reason Discontinued/Returned/Damaged). Salesperson: read-only note. |
| Dashboard | Green slot (strip) | Same box details popup |
| Dashboard | Empty slot | Owner: activation starts with that box pre-picked. Salesperson: nothing, no message. |
| Dashboard | Scan new book (in stock) | Box-number popup: book summary, BOX # (first empty prefilled), up/down to next/previous empty, empty-box chips, keypad, Not in box, Add to box N |
| Dashboard | Scan book already active | Last-scan panel + toast "already active in box N" |
| Dashboard | Scan unknown pack | Red "Book not in inventory" + toast |
| Dashboard | Settlement | Popup: this shift (scanned, tickets, sales), last closed shift, All reports, Get Report / End Shift |
| Dashboard | This Month / Week / Today / Inactive | List popup: Box, Game, Pack, Price, Ticket now, activation age or days without sales |
| Dashboard | Update Inventory | Rack replaced by scan table (Added / Already here / New game). Finish, Cancel, Undo. |
| Dashboard | End Shift | Scan mode starts at once, toast, no confirmation. Tiles turn green as scanned. |
| Dashboard | Get Report | "Check before closing" popup: activations, empty slots, sold-out list, optional terminal Cashes/Online/Online cashes. Cancel or Confirm. |
| Dashboard | Confirm | 1.6s calculating, then report in-page, emails sent, Retry on failure, PDF, Print, Done |
| Dashboard | Done / Start New Shift | Shift closed / next shift loads closing positions as opening |
| Dashboard | Cancel / Undo | Cancel: stops activation / update / end-shift (end-shift clears all scans). Undo: last action, history of 20. |
| Close Shift | Row buttons | No change, Sold out, Confirm no change, Keep N, Rescan |
| Close Shift | Get Report | Disabled until no issues; then popup with "I counted the empty slots" checkbox |
| Inventory | Add New Book | Receive popup: scan field, Game ID, Pack #, Start ticket, price chips, auto pack value, keypad |
| Inventory | Update Inventory | Scan panel above the table |
| Inventory | Table row | Nothing (rows are not tappable) |
| Reports | View | Preview popup. Retry resends a failed email. |
| Reports | Daily report tab | Date chips, Print, Email daily report |
| Settings | Tabs | Store & email, Boxes (stepper + map), Games (add), People (add, on/off switch) |

## 5. Design vs live (to confirm by the agent)

| Live feature (from the handoff, text only) | Design status |
|---|---|
| Quick Clerks + PIN sign-in | Different: name + password |
| Dashboard rack of 65 boxes, shift banner | Designed |
| Receive Packs / box assignment (4 steps) | Partly: Receive popup + box popup |
| Put Ticket into Box, Switch boxes, Change box number | Only Change box (move to empty box) |
| Change Ticket Value, Fix Ticket Position, rack position fix drawer | Not designed |
| Box detail panel | Designed (popup) |
| Manager-approval PIN modal | Not designed |
| Partial/vault-pack warning | Not designed |
| Two close-shift UIs | Both designed, inconsistent with each other |
| Shift settlement and cash count | Settlement popup only; no cash count |
| Start Shift (handover) | Designed (button + loading) |
| Stock Intake and Pack Movement (6 types) | Not designed |
| Update Inventory and audit | Designed |
| Inventory page | Designed |
| Reports (shift/daily, analytics tabs) | Shift + Daily only; no analytics |
| Day Report corrections (v1/v2) | Not designed |
| Email to manager, Past Shifts/Days | Partly |
| Settings (store, boxes, games, people, resets, MySQL modal) | Store, Boxes, Games, People only |
| Voice-Guided Session, quick guides, receipt slip | Not designed |
| A4 shift/day reports | Shift report designed; no day report layout |

For every "Not designed": keep the live look inside the new shell, or build an extended design from the
same tokens ONLY after the owner approves.

## 6. Wording conflicts (ask the owner)

| Design says | Live says |
|---|---|
| Cashes / Online Cashes / Total Cashes | Confirm (unconfirmed meaning) |
| Ending Count | Closing Count |
| Back Inventory | Safe Inventory |
| Check before closing the shift (dashboard) / Confirm and close shift (Close Shift page) | Check before closing |
| Activate Book, Update Inventory, Get Report, Start New Shift | confirm live labels |

## 7. Design-side data conflicts (do not copy; use live data)
65 boxes vs a 70-row sample report; game 1411 named Lucky 7s ($5) and Jumbo Classic ($2); Hit 100 as 1404 ($2) and
1153 ($1); $30 game with 30 tickets vs the $300-pack rule (10 tickets); pack numbers mix 6 and 7 digits;
dates inconsistent (see DESIGN_ISSUES.md #7).
