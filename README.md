# Stock Report

A stock report system for a small product business: how much stock there is, how fast it sells, when to reorder, and where every supplier order is. Built from the *SOP of Stock Report*.

**Live demo:** https://claude.ai/artifact/HwDgKgZ3mbvkBPokdmaXU9 (a Claude Artifact; it opens only once the owner has shared it with you)

The demo business is **Ridgeline Coffee Supply**, a made-up Denver coffee-gear shop with 6 products, 4 suppliers, 45 days of sales, 14 supplier orders and 7 arrivals. All data is fake, emails use `@example.com`, and tracking numbers are invented.

## Run it locally (under 5 minutes)

Needs Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Run locally, the app keeps its data in your browser (Setup → Data → "Start over" resets it).

```bash
npm test           # business-rule tests (SOP section 4) + demo data checks
npm run build      # typecheck, build, and write artifact/stock-report.html
```

`artifact/stock-report.html` is the single page published as the Claude Artifact.

## Where things are

```
src/domain/      Pure TypeScript, no UI. Every rule in the SOP lives here once.
  types.ts         Data model
  forecast.ts      Sales speed, days of stock, reorder flags, try an order
  orders.ts        Order stages, overall status, chase rules, carrier links
  arrivals.ts      Oldest-first matching, hand matching checks
  stock.ts         Stock ledger: warehouse stock and its history
  sales.ts         SKU to product matching, bundles, sold-not-shipped
  report.ts        Builds everything the screens show in one pass
  mutations.ts     Every user action, as state -> ChangeSet
  messages.ts      Order message, follow-ups, reorder alert email
  rules.test.ts    Hand-worked checks of every SOP number
src/data/        Demo business, simulated store/warehouse feed
src/app/         React UI: store (shared or private), views, dialogs, components
src/components/ui/  shadcn/ui primitives
scripts/         Artifact packaging, seed export
docs/            Design note, demo outline
```

## Data

- **In the Artifact:** data lives in the artifact's shared database, so staff and suppliers see the same orders live. Someone who can only view the artifact gets a private copy in their browser, so they can still try every feature without changing the shared data.
- **Locally:** a private copy in the browser.
- No keys, passwords or tokens anywhere. Email runs in test mode: messages are logged under Messages and never delivered.

To re-seed the artifact's shared data: `SEED_OUT=seed npm run seed:export` writes one JSON file per document. The owner can also reset it from Setup → Data.
