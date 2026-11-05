# Stock Report: design note

Demo: https://claude.ai/artifact/HwDgKgZ3mbvkBPokdmaXU9 · Code: this repo · Run: see README

## 1. How it is designed

**Screens follow the ten questions in SOP section 2.** The home screen answers the daily ones in a single view; detail screens answer the rest.

| Screen | Answers | What's on it |
|---|---|---|
| **Stock** (home) | Q1–Q5, Q8, Q9 | **To do today** first: a ranked list (reorders, follow-ups, stock that runs out before the next delivery, unmatched arrivals), each item with the one button that resolves it, plus "Waiting on suppliers" and "Done today". Below it, every product sorted worst first, with filters: warehouse stock, sold-not-shipped, sales per day with trend, days of stock with a runway bar, units on order, reorder-by and suggested order. |
| **Product** | Q3–Q6 | One callout per flag, written as a sentence ("Reorder now, even counting open orders…"). **Stock outlook** charts past stock, the projection at today's pace, when each open order should land, and red bands where there'd be nothing to sell. **Try an order** updates the days of stock as you type, with a runway bar marked at the reorder line and the target. A 30-day sales chart shades the exact 7-day window, split into the prior 4 and last 3 days that the trend factor compares. **How the numbers are worked out** shows every formula with this product's real values. |
| **Supplier orders** | Q7, Q8 | Filter by product and stage. Each order's stage bar shows where its units are: arrived, on the way, in production, placed, or not coming. The detail panel holds every action (confirm, tracking, arrival, edit, close, cancel, reopen, delete with confirmation), tracking linked to the carrier, the order message, follow-ups, and a who/what/when history. |
| **Arrivals** | Q9 | Unmatched arrivals pinned at the top. Recording an arrival previews the oldest-first match before you save. Hand matching splits units across orders or marks them "not from an order". |
| **Stock history** | Q10 | A ledger per product: count, arrivals, moves between orders, manual sales and adjustments, and daily shipments. Each line shows the change, the stock after it, why, and who. |
| **Messages, Setup** | | Test-mode outbox. Forecast defaults with per-product overrides, products (SKUs and bundles), suppliers, reorder alert emails, data sync. |
| **Supplier portal** | supplier | Only that supplier's orders. Only two actions: confirm, add tracking. |

**Phone (390 px):** tables become cards, navigation moves to a bottom tab bar, and dialogs and panels go full width. Nothing scrolls sideways.

**Speed and safety:** every action's toast offers **Undo**, which restores exactly the records it changed. **Ctrl/Cmd+K** (or /) searches products, orders, arrivals and actions. N, A and L open a new order, an arrival and a stock change. The stock report exports as CSV or copies as a table for email or chat. "Follow up on all" prepares every due chase message at once.

**Timing, on top of the SOP.** "Days with everything ordered" counts ordered units as if they were already on the shelf. So each open order also gets an expected arrival: tracked units land 10 days after shipping (the same 10 days the chase rule uses); everything else lands at order date + lead time. A day-by-day projection then shows whether stock runs out before the order lands. In the demo, the grinder runs out 26 days before its order arrives, which no SOP number shows. None of the SOP numbers change.

**Structure.** `src/domain` is plain TypeScript with no UI, and each rule lives there once. The UI calls a single `run()` for every action. `run()` executes a pure mutation that returns a `ChangeSet`, then saves it to whichever store is active. Shared visual parts are also written once and reused: `StageBar` (orders list, order panel, product page, supplier portal) and `CoverageBar` (table, cards, try an order, new-order dialog).

**Data model.** Only facts are stored: products (with SKUs and units per sale), suppliers, orders (with tracking, follow-up times and history), arrivals (with their allocations to orders), manual stock changes, daily sales and shipments per SKU, the outbox, and settings. Everything else is derived on read:
- warehouse stock comes from the ledger
- an order's stage comes from its tracking and arrivals
- forecasts and flags come from the sales and stock data

So no stored number can drift from its source, and changing a rule means changing one function.

**Stack, and where it runs.** React 19, TypeScript, Tailwind 4 and shadcn/ui (Radix primitives), built by Vite into one HTML file and published as a **Claude Artifact**, as the brief asked. Data lives in the artifact's shared database, so staff and suppliers see the same orders live. Viewer identity records who did what (only ids are stored; names are resolved when shown). A viewer who can't write (view-only share or signed out) automatically gets a private copy in their browser, so the demo is fully usable by anyone. Charts are hand-written SVG so the 4 + 3 day split and the markers are exact.

## 2. What works and what doesn't

**All (must) items work.** Of the (should) items:
- **Done:**
  - bundles ("buy 2 get 2" = 4 units)
  - carrier tracking links (UPS, FedEx, USPS, DHL)
  - order message to copy or log
  - follow-up messages
  - reorder alert on/off, recipients and test send
  - stale-data warning with Sync
- **Partly done:**
  - **Supplier login** is a role switch ("Viewing as"), not real accounts. The artifact platform controls access per share level, not per supplier, so anyone with access could switch to staff. A real deployment needs accounts and server-side rules.
  - **Reorder alert emails** go out when someone clicks; there is no daily scheduler.

**Known limits:**
- Email is never delivered (test mode, as allowed).
- Sales and shipments come from a simulated store feed (deterministic, so numbers stay stable). There is no CSV import.
- Shared writes are last-writer-wins per document, with no multi-document transactions.
- Products can't be deleted, because that would orphan their orders.

## 3. How I checked the numbers against section 4

- **82 tests in total.** **44 unit tests** (`src/domain/rules.test.ts`). Each test name carries the hand calculation. For example, with sales of 10, 10, 10, 10, 14, 14, 14:
  - trend = (42/3)/(40/4) = 1.4
  - adjusted burn = 11.714 × 1.4 = 16.4
  - suggested order = (60+45) × 16.4 − 500 = 1222

  The tests cover:
  - every row of the forecast table
  - the trend capped at 2 and floored at 0.5, and trend = 1 when the prior 4 days had no sales
  - blank values when burn is 0
  - all flag thresholds, per-product settings and rounding drift
  - every order stage and the status order
  - all three chase rules at their exact boundaries (2 vs 1 day, 10 vs 9 days, more than 10 vs 10), plus the 2-day repeat
  - oldest-first matching and spill-over, bundles and sold-not-shipped
  - the Denver day boundary and the DST change
- **9 outlook and to-do tests**: the projection's run-out day matches the SOP's "sells out on", plus arrival estimates and the ranking. **4 undo tests** check that applying an action and then its undo gives back identical data.
- **25 demo-data tests** generate the business on four different dates, including summer time. They assert that every flag, stage and chase type appears and that stock never goes negative. They also check that syncing four days later keeps every forecast live.
- **In the app**, each product page shows its working ("93 ÷ 7 = 13.3", "(49 ÷ 3) ÷ (44 ÷ 4) = 1.48"), so anyone can re-check by hand.

**Interpretations I made (stated, not hidden):**
- "Last 7 days" means the 7 completed store days before today. Today is partial and would drag the burn down every morning.
- Sells-out-on and reorder-by use whole days, rounded down: the day the line is crossed.
- The suggested order is rounded up to whole units. It follows the SOP formula exactly, which does **not** subtract units already on order, so the product page shows "N already on order" next to it.
- Arrivals use up the oldest tracked shipment first. That decides "on the way" and "ask where it is".
- A manual sale counts toward sales speed. An adjustment changes stock only.
- A follow-up sent before an alert's reason began doesn't snooze that alert.

## 4. How I used AI

I built this with Claude (Claude Code). It worked well at turning the SOP into a data model and pure rule functions, writing tests with the arithmetic spelled out, shaping demo data so every rule shows a real value, and building the UI quickly.

Problems found and fixed along the way:
- The shadcn CLI resolved the `cn` helper to an unrelated npm package. It was replaced with the local util.
- The first version wrote manual sales into the sales feed, which would have shown them as "sold but not shipped". They moved to their own ledger line.
- "Shipped" first meant "shipped out of that day's sales". When stock arrived after the sale date, the history balance went negative. It was redefined as "shipped that day".
- The demo generator produced invalid timestamps for past days. The tests caught it.

*(Salik: review and rewrite this section in your own words before handing in.)*

## 5. With one more week

1. Real accounts and server-side rules, so a supplier's data access is limited to their own orders.
2. Real feeds: a store order import (Shopify/CSV), a warehouse stock export, scheduled sync, and a daily reorder email job.
3. An append-only event log behind order and arrival history, with transactions.
4. Scan a tracking number at the dock to record an arrival against that exact shipment.
5. Supplier lead times, minimum order quantities and case-pack rounding on suggested orders, and product archiving.
6. Browser tests (Playwright) on laptop and phone widths.
