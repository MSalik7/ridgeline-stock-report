# Stock Report: design note

Demo: https://ridgeline-stock-report.vercel.app · Claude Artifact: https://claude.ai/artifact/HwDgKgZ3mbvkBPokdmaXU9 · Code and run steps: README

## 1. How it is designed

**Screens start from the ten questions in SOP section 2.** The home screen answers the daily ones at a glance; detail screens answer the rest.

| Screen | Answers | What's on it |
|---|---|---|
| **Stock** (home) | Q1–Q5, Q8, Q9 | A ranked **to do today** list, each item with the one button that resolves it. **Plan reorders** batches everything due by supplier. Then every product, worst first. |
| **Product** | Q3–Q6 | Each flag as a sentence, **try an order**, an interactive stock chart (history, then the projection; hover for any day's exact stock and why it moved, drag to zoom), and every formula worked with this product's numbers. |
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

**136 automated tests.**
- **Rules (44 tests):** each test name carries the hand calculation. For example, sales of 10, 10, 10, 10, 14, 14, 14 give trend = (42/3)/(40/4) = 1.4, adjusted burn = 11.714 × 1.4 = 16.4, and suggested order = (60+45) × 16.4 − 500 = 1,222. They cover every forecast row, the trend limits, blanks at zero burn, every flag threshold, every stage and the status order, all three chase rules at their exact boundaries with the 2-day repeat, matching, bundles, and the Denver day boundary across a daylight-saving change.
- **The other 92:** the outlook, Undo, the scorecard, money, the stock chart, stock history, input and saved-data checks, plus demo data generated on four dates. The demo data must show every flag and stage, never go negative, and use only @example.com emails.
- **Stress test:** at 10× the demo (60 products, 290 orders) every screen opens in about 0.3 s or less. It found slow lists, a crash on impossible saved dates and forms that accepted Feb 31; all are fixed.
- **In the app:** each product page shows its working ("93 ÷ 7 = 13.3"), so anyone can re-check it.

**Interpretations:**
- "Last 7 days" means the 7 completed store days before today.
- "Sells out on" and "Reorder by" round down to whole days.
- The suggested order rounds up and doesn't subtract units already on order, as the SOP says.
- Arrivals use up the oldest tracked shipment first.

## 4. How I used AI

I used Claude (through Claude Code) for most of the building, starting from the SOP PDF. The biggest help was speed: it turned the PDF into a working app with every screen in a few days. When I asked it to look for errors or stress-test the site, it found real bugs and fixed them. It also explained how each number is worked out and why things were built the way they are, so I can explain the app myself instead of just showing it.

It still needed me, though. Some problems only showed up when I looked at the screens: long supplier names were breaking the sidebar, so I sent screenshots and had it fix them. It also didn't think of everything. The sidebar toggle, the interactive stock chart, product photos without brand logos and demo data that matches across the charts were all things I asked for. I also decided what to build next and when to deploy and push.

A few mistakes were caught along the way. At first it counted manual sales as sold but not shipped, and it treated "shipped" as only that day's sales, which made the stock history go negative. The fake data even used the name of a real café in Denver. Later, the stress test found lists that got slow and forms that accepted dates like Feb 31.

To check its work, I clicked through the live site, tried it on my phone, compared the numbers with section 4 of the SOP, and had it audit its own work against the PDF. My main takeaway: AI is very fast, but it needs someone reviewing it. Every screen and every rule still had to be checked.

## 5. With one more week

1. Real accounts, so a supplier can only reach their own orders.
2. A CSV or Shopify import, scheduled sync and a daily reorder email.
3. An event log with transactions behind the history.
4. Scanning a tracking number at the dock to record an arrival.
5. Browser tests at laptop and phone widths.
