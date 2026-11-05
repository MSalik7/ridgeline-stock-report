# Stock Report

A stock report system for a small product business: how much stock there is, how fast it sells, when to reorder, and where every supplier order is. Built from the *SOP of Stock Report*.

- **Live demo:** https://ridgeline-stock-report.vercel.app (open to anyone; each visitor gets their own copy of the demo data)
- **Claude Artifact:** https://claude.ai/artifact/HwDgKgZ3mbvkBPokdmaXU9 (shared data; opens once the owner shares it with you)

The demo business is **Ridgeline Coffee Supply**, a made-up Denver coffee-gear shop with 6 products, 4 suppliers, 45 days of sales, 14 supplier orders and 7 arrivals. All data is fake, emails use `@example.com`, and tracking numbers are invented.

## Run it locally (under 5 minutes)

Needs Node 20.19+ or 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173
```

The app keeps its data in your browser. Setup → Data → "Start over" resets it.

```bash
npm test           # 113 tests: SOP section 4 rules, money, demo data checks
npm run build      # typecheck, build, and write artifact/stock-report.html
```

## What it does

- **Stock:** a ranked "to do today" list, then every product worst first, with stock, sold-not-shipped, sales speed and trend, days of stock, reorder flags and suggested orders. "Plan reorders" batches everything due by supplier.
- **Product:** each flag explained, try an order, a stock outlook showing when open orders land, and every formula worked with real numbers.
- **Supplier orders:** stages, tracking with carrier links, order and follow-up messages, a printable purchase order, full history, and a supplier scorecard.
- **Arrivals and stock history:** oldest-first matching, hand matching, and a ledger of every stock change.
- **Money:** stock value, cash promised to suppliers, and what reorders will cost.
- **Supplier portal:** a supplier sees only their orders and can confirm them and add tracking.
- **Everywhere:** an activity bell, Undo on every action, Ctrl/Cmd+K search, light and dark themes, and a phone layout at 390 px.

## Where things are

```
src/domain/      Pure TypeScript, no UI. Every rule in the SOP lives here once.
  types.ts         Data model
  forecast.ts      Sales speed, days of stock, flags, try an order
  orders.ts        Order stages, overall status, chase rules, carrier links
  arrivals.ts      Oldest-first matching, hand matching checks
  stock.ts         Stock ledger: warehouse stock and its history
  sales.ts         SKU matching, bundles, sold-not-shipped
  outlook.ts       When open orders land; whether stock runs out first
  report.ts        Builds everything the screens show in one pass
  actions.ts       The ranked "to do today" list
  mutations.ts     Every user action, as state -> ChangeSet
  messages.ts      Order message, follow-ups, reorder alert email
  money.ts         Stock value and committed cash
  reorder.ts       Plan reorders (due now and due soon)
  po.ts            Purchase order document
  activity.ts      The activity feed behind the bell
  suppliers.ts     Supplier scorecard
  *.test.ts        Hand-worked checks of every SOP number
src/data/        Demo business, simulated store and warehouse feed
src/app/         React UI: store (shared or private), views, dialogs, components
src/components/ui/  shadcn/ui primitives
scripts/         Artifact packaging, seed export
docs/            Design note, demo outline
```

## Data

- **On Vercel or locally:** a private copy in each browser.
- **In the Artifact:** data lives in the artifact's shared database, so staff and suppliers see the same orders live. Someone who can only view the artifact gets a private copy instead.
- No keys, passwords or tokens in the code. Email runs in test mode: messages are logged under Messages and never sent by the app.

## Deploy

- **Vercel:** `npx vercel@latest deploy --prod` (settings are in `vercel.json`).
- **Artifact:** `npm run build`, then publish `artifact/stock-report.html`.
- **Re-seed the Artifact's shared data:** `SEED_OUT=seed npm run seed:export` writes one JSON file per document. The owner can also reset it from Setup → Data.
