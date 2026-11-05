# Stock Report: design note

Demo: https://ridgeline-stock-report.vercel.app · Claude Artifact: https://claude.ai/artifact/HwDgKgZ3mbvkBPokdmaXU9 · Code and run steps: README

## 1. How it is designed

**Screens start from the ten questions in SOP section 2.** The home screen answers the daily ones at a glance; detail screens answer the rest.

| Screen | Answers | What's on it |
|---|---|---|
| **Stock** (home) | Q1–Q5, Q8, Q9 | A ranked **to do today** list, each item with the one button that resolves it. **Plan reorders** batches everything due by supplier. Then every product, worst first. |
| **Product** | Q3–Q6 | Each flag as a sentence, **try an order**, a stock outlook showing when open orders land, and every formula worked with this product's numbers. |
| **Supplier orders** | Q7, Q8 | Filters by product and stage, a stage bar per order, every action, carrier links, messages, a printable purchase order and the full history. A scorecard compares each supplier's real lead time with the setting. |
| **Arrivals** | Q9 | Unmatched arrivals first; the oldest-first match is previewed before saving; hand matching. |
| **Stock history** | Q10 | A per-product ledger: each change, the stock after it, why and who. |
| **Money** | extra | Stock value, cash promised to suppliers, and what reorders will cost. |
| **Supplier portal** | supplier | Only that supplier's orders: confirm and add tracking. |

**Everywhere:** a five-step guided tour on first visit, an activity bell, Undo on every action, Ctrl/Cmd+K search, and light and dark themes. **On a phone (390 px)**, tables become cards and navigation moves to a bottom tab bar.

**Timing, on top of the SOP.** "Days with everything ordered" counts ordered units as if they were already on the shelf. So each open order also gets an expected arrival: tracked units land at ship date + 10 days (the chase rule's 10 days), the rest at order date + lead time. A day-by-day projection then shows whether stock runs out first. In the demo, the grinder is out for about three weeks before its next order lands, which no SOP number shows. None of the SOP numbers change.

**Structure.** `src/domain` is plain TypeScript with no UI, and each rule lives there once. Every action is a pure function that returns a `ChangeSet`. The UI runs it through one `run()` that saves it and offers Undo. Shared parts such as `StageBar` and `CoverageBar` are written once and reused.

**Data model.** Only facts are stored: products (SKUs, units per sale, unit cost), suppliers, orders (tracking, follow-ups, history, price), arrivals with their allocations, manual stock changes, daily sales and shipments per SKU, the outbox and settings. Stock, stages, forecasts and flags are derived on read, so no stored number can drift from its source.

**Stack, and where it runs.** React 19, TypeScript, Tailwind 4 and shadcn/ui, built by Vite into one HTML file. As a **Claude Artifact**, data is shared, so staff and suppliers see the same orders live. On **Vercel**, each visitor gets a private copy in their browser. There's no backend and there are no keys.

## 2. What works and what doesn't

**Every (must) item works.** Of the (should) items:
- **Done:** bundles, carrier links, an order message to copy or email, follow-up messages, reorder alert emails with a test send, and an old-data warning.
- **Partly done:** the supplier login is a role switch, not real accounts, so anyone can switch to staff.

**Known limits:**
- Email runs in test mode only.
- Sales come from a simulated feed; there's no CSV import.
- Reorder alerts send on click, not on a schedule.
- When two people save the same shared record, the last save wins.
- Products can't be deleted.

## 3. How I checked the numbers against section 4

**113 automated tests.**
- **Rules (44 tests):** each test name carries the hand calculation. For example, sales of 10, 10, 10, 10, 14, 14, 14 give trend = (42/3)/(40/4) = 1.4, adjusted burn = 11.714 × 1.4 = 16.4, and suggested order = (60+45) × 16.4 − 500 = 1,222. They cover every forecast row, the trend limits, blanks at zero burn, every flag threshold, every stage and the status order, all three chase rules at their exact boundaries with the 2-day repeat, matching, bundles, and the Denver day boundary across a daylight-saving change.
- **The other 69:** the outlook, Undo, the scorecard, money and purchase orders, plus demo data generated on four dates. The demo data must show every flag and stage, never go negative, and use only @example.com emails.
- **In the app:** each product page shows its working ("93 ÷ 7 = 13.3"), so anyone can re-check it.

**Interpretations:**
- "Last 7 days" means the 7 completed store days before today.
- "Sells out on" and "Reorder by" round down to whole days.
- The suggested order rounds up and doesn't subtract units already on order, as the SOP says.
- Arrivals use up the oldest tracked shipment first.

## 4. How I used AI

I built this with Claude (Claude Code). It worked well at turning the SOP into pure rule functions, at writing tests with the arithmetic spelled out, and at building the UI quickly.

Where it needed correcting:
- It first counted manual sales as sold but not shipped. They became their own ledger line.
- "Shipped" first meant "shipped from that day's sales", which pushed stock history negative.
- The "fake" demo data named a real Denver café.
- On review, I found long supplier names spilling out of the sidebar.

*(Salik: rewrite this section in your own words before handing in.)*

## 5. With one more week

1. Real accounts, so a supplier can only reach their own orders.
2. A CSV or Shopify import, scheduled sync and a daily reorder email.
3. An event log with transactions behind the history.
4. Scanning a tracking number at the dock to record an arrival.
5. Browser tests at laptop and phone widths.
