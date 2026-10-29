# DESIGN_ISSUES.md

Problems inside the MOCKUP (found by reading its source; not rendered). Do not copy them into the app.
Live-app bugs go in `BUGS_FOUND.md` (separate file, written by the agent). Confidence: **Read** = seen in
the source; **Likely** = follows from the CSS, needs a render test.

## High

1. **Unscanned boxes are counted as sold out silently.** (Read)
   Main.dc.html: Get Report is enabled with any number of scans, including zero. `buildReport()` treats a
   box with no closing scan as `close = size`, i.e. fully sold. The confirm popup shows a warning banner
   but Confirm stays enabled. CloseShift.dc.html does the safe thing (blocks until every box is scanned,
   No change, or Sold out). The two flows contradict each other. Keep the live rule; report how live
   handles it; ask the owner.

2. **Cancel during End Shift wipes all scans in one tap, no confirm.** (Read)
   Main `cancel()` when closing: `closing:false, closes:{}` and history cleared. It sits next to Undo, same
   size and same pink. Needs a confirm or a different position.

3. **Remove book throws away the position you enter.** (Read)
   The field says "Scan the top ticket so sold tickets still count", but `doRemove()` only deletes the box
   and ignores `rmPos` and the reason. The report hard-codes Discontinued `0` and Removed `-`.

4. **Settings adds "Count down" ticket numbering.** (Read)
   Settings.dc.html Add game: "Ticket numbers on this game: Count up / Count down". This would change
   position and sales math (frozen zone). Do not build unless the live app already has it.

5. **Sold-out rule differs between the two close flows.** (Read)
   Main: scanning the ticket equal to pack size counts as sold out and clears the box. CloseShift: the same
   scan is a normal "Scanned"; only the Sold out button sets sold out. Activation allows 0..size-1,
   closing allows up to size.

6. **Close Shift report numbers do not add up.** (Read)
   Active boxes = packs minus sold out, but Empty boxes = 65 minus packs (counted before sold-out boxes
   clear). In the sample: 19 active + 45 empty = 64, not 65.

7. **Dates and data are inconsistent.** (Read; weekday check done)
   - Main header: "Monday, Oct 19" (correct for 2026). Reports "Today" = Oct 18. Shift report sample date 08/04/2026.
   - History "Fri, Oct 17" and CloseShift "Sat, Oct 18, 2026" are 2025 weekdays. In 2026 they are Saturday and Sunday.
   - Reports "View" shows the same 8 pack lines for every shift: 61 tickets, $325, under headers like 214 tickets, $1,284.00.
   - Settlement "Last closed shift" is hard-coded (#12, Daniel, 251, $1,512.00).
   - Hard-coded: shift #13, open 7:02 AM, address, user, the two email recipients, a forced "Failed" email status.
   - Game IDs and prices conflict (see DESIGN_MAP.md section 7).
   - Parser regex differs: Main and CloseShift require a 3-digit ticket; Inventory makes it optional.

## Medium

8. **Inactive count is unreadable.** (Read + contrast calc)
   `.fb.warn b{color:var(--warn)}` on a button with inline `background:#1d4ed8`: about 1.25:1.

9. **Dark mode and tokens are bypassed by inline styles.** (Read)
   - `.lt .btn-primary{color:#fff}` (Main, Inventory) forces white on the dark-theme brand `#6B97FF`: about 2.8:1 on every primary button.
   - Settlement and filter buttons hard-code `#1d4ed8` and ignore dark tokens.
   - Cancel / Undo hard-code `#E2C4C0` with `#06200f`.
   - Inline hex overrides found: Main 9, CloseShift 4, Inventory 4, Settings 3, History 1.
   Map to tokens, not to the inline values.

10. **Bottom box strip is too small to tap.** (Read + estimate)
    `.slots` is 33 columns until 820px: roughly 18px wide at a 900px window, about 24px at 1100, about
    34 x 30px at 1440. Under a 44px target, and it is the control for activating an empty box.

11. **Dashboard tile differs from the Style Guide tile.** (Read)
    Style Guide: game name, pack, "Opening position", green top edge = active, blue top edge = activated this
    shift. Dashboard `.tl`: price, box number, position only; game and pack appear only in a hover tooltip
    (`title`), which does not work on touch.

12. **Number formats differ.** (Read) Tile shows position unpadded ("8"); everywhere else padded ("008").

13. **Keypad popup X performs "Not in box".** (Read) The button is labelled "Close" but runs `notInBox`.
    Salesperson tapping an empty slot gets no message.

14. **Popups lack keyboard basics.** (Read) `role=dialog aria-modal` is present; no Escape handling or
    focus trap found.

## Low / ship-blockers

15. Demo-only elements to remove: "Scan next box" button and "Try a scan" chips (CloseShift, Inventory),
    unused `.samples` CSS in Main, legacy `.tile-sell` in the shared CSS.
16. Sidebar auto-closes after 5 idle seconds (accessibility). Prop `autoCloseSeconds`; 0 disables.
17. Sync-status component (`.sync`) exists in the CSS but no screen uses it.
18. CloseShift "Scanned twice" offers only "Keep N" (the new value); the earlier number is shown in the tag
    but there is no "keep previous" button.
19. Report math has no cash reconciliation (variance); live has expected vs counted cash. Keep live.
