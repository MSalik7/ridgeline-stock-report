/**
 * Writes the demo business as one JSON file per database document, for
 * seeding the artifact's shared storage. Run: npm run seed:export
 */
import { it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDemoState } from "../src/data/demo";

it.skipIf(!process.env.SEED_OUT)("exports the demo seed", () => {
  const out = process.env.SEED_OUT!;
  rmSync(out, { recursive: true, force: true });
  const state = buildDemoState(new Date());
  const write = (collection: string, id: string, data: unknown) => {
    mkdirSync(join(out, collection), { recursive: true });
    writeFileSync(join(out, collection, `${id}.json`), JSON.stringify(data));
  };
  for (const c of ["products", "suppliers", "orders", "arrivals", "stockChanges", "sales", "outbox"] as const) {
    for (const x of state[c] as { id?: string; date?: string }[]) write(c, (c === "sales" ? x.date : x.id)!, x);
  }
  write("config", "settings", state.settings);
  write("config", "feed", state.feed);
});
