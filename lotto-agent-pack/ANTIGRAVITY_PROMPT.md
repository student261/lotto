# LottoTrack Pro: redesign + responsive fix (agent brief)

Paste this whole file into the agent chat, with this pack copied into the `lotto` project root first
(`design/`, `DESIGN_MAP.md`, `DESIGN_ISSUES.md`, `DESIGN_RESPONSIVE_NOTES.md`).

## 1. Who and what
Owner: Maulik, Amigo Food Mart, 2300 Moody Rd, Warner Robins GA.
App: "LottoTrack Pro", a scratch-off lottery POS web app, live at https://lotto123i.netlify.app/.
It tracks books (packs) in a 65-box dispenser rack, activates new books, runs shifts, closes a shift by
scanning the top ticket in each box, and produces A4 shift/day reports emailed as PDF.

## 2. The three goals
a) Apply the new visual design (files in `design/`) to the live app.
b) Do NOT change barcode scanning or its accuracy in any way.
c) Fix broken responsiveness on big and small desktop screens, and make it impossible to regress
   (automated tests + lint + a written contract).

## 3. Read first (in this order)
1. `DESIGN_MAP.md`: design screens, tokens, tap map, what is designed vs not designed.
2. `DESIGN_ISSUES.md`: problems INSIDE the mockup. Do not copy these into the app.
3. `DESIGN_RESPONSIVE_NOTES.md`: mockup responsive weaknesses and a starter contract.
4. `design/screens/*.dc.html` and `design/tokens-and-components.css`.

The design files are a reference mockup, not production code. They use a mockup runtime
(`<x-dc>`, `sc-if`, `sc-for`, `dc-import`, `DCLogic`) that is NOT part of the app. Read them as source for
values (colours, sizes, spacing, radii, shadows, layout) and behaviour notes. Re-create them in the app's
own styling and framework. Do not ship the mockup runtime, `support.js`, sample data, or demo buttons.
The screens will not render on their own; the CSS is loaded from a hosted blob in the mockup, so use the
supplied `tokens-and-components.css`.

## 4. FROZEN ZONE: never change behaviour
- Scan input and focus handling (including the hidden always-ready input), keyboard-wedge and debounce logic.
- Every barcode parser. The live parser is the source of truth. Never replace it with the mockup regex.
- Box-barcode scanning (the box-number input in the box popup).
- Scan validation messages: not in inventory, already in box, sold out previously, lower than opening,
  outside book, partial/vault pack.
- Position and sales math, pack size rules, shift rollover, voice/audio tied to scans.
- Do not change a scan field's type, inputmode, autofocus or handlers. Do not copy mockup `autofocus`.
If a design or layout change seems to need any of this: STOP and ask the owner.

## 5. Behaviour in the design that is NOT presentation (needs owner approval before building)
- Login by sign-in name + password (live uses Quick Clerks + PIN).
- Roles Owner/Salesperson gating (live has a manager-approval PIN modal the design does not show).
- Settings "Ticket numbers: Count up / Count down" (would change position math).
- Pack size derived from price ($300 packs, $900 for $50 tickets). Check how live stores pack size.
- Settlement popup and any "Last closed shift" block (design has no cash count).
- Report math for boxes with no closing scan (see DESIGN_ISSUES.md #1).
- Sidebar auto-collapse after 5 idle seconds (accessibility problem; default to OFF unless approved).

## 6. Ask the owner BEFORE Phase 3 (one message, all questions)
1. Where is the source repo, and where is data stored (localStorage, MySQL, API)?
2. Wording where design and live differ: Cashes vs Confirm; Ending Count vs Closing Count;
   Back Inventory vs Safe Inventory. Which to use?
3. Which close-shift UI is the real one: dashboard "Check before closing" modal, or the full Close Shift
   page? Remove the duplicate? (The design also contains both, and they behave differently.)
4. What to do with leftover prototype screens: Voice-Guided Session, store #402 receipt slip, MySQL/XAMPP modal.
5. Screens with no design (Stock Intake, Reports analytics, Settings tabs, Day settlement, Change Ticket
   Value, Fix Ticket Position, Switch boxes, partial/vault warning): approve extended designs built from
   the same tokens?
6. Is a Spanish UI needed (affects text length)?
7. Sidebar auto-collapse: keep or drop?
8. Items in section 5 above.

## 7. Phase order (do not skip; commit small)
0. Safety net: new branch; find all persistence/storage keys; capture GOLDEN barcode tests BEFORE any
   edit (inputs and outputs of every parser and scan validation path). Tests must pass unchanged at the
   end of every later phase.
1. Explore every button, modal and function per role. Write `INVENTORY.md`.
2. Map design to live in `DESIGN_MAP.md` (extend the file provided). List gaps and wording conflicts.
3. Implement presentation only, screen by screen, small commits. Keep element IDs, data attributes,
   handlers and function names used by logic. Existing saved data must still load.
3B. Responsive fixes and enforcement (see `DESIGN_RESPONSIVE_NOTES.md` for the starter contract).
4. Verify and report.

## 8. Deliverables
`INVENTORY.md`, `DESIGN_MAP.md` (extended), `RESPONSIVE_AUDIT.md` (what breaks in the LIVE app, where,
root cause), `BUGS_FOUND.md` (live bugs noted, NOT fixed), `RESPONSIVE_CONTRACT.md`, characterization
tests for scanning, responsive matrix tests (widths 320 to 3440, heights 600 to 1080, zoom 80 to 200%,
extreme data), lint rules, before/after screenshots, `FINAL_REPORT.md`.

## 9. Working rules
- Change presentation only. List suspected logic bugs; do not fix them.
- Never invent data, labels or behaviour. Ask one specific question when unsure.
- Do not claim anything works unless you ran it. State what you did not verify.
- Follow the project's `AGENTS.md` (Ponytail) for code size, but never skip the golden tests, validation,
  accessibility or the contract above.
- Live behaviour is unconfirmed until you inspect the real code. Everything this pack says about the live
  app came from reading its rendered text only.
