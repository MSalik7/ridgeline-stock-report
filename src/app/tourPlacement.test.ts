import { describe, expect, it } from "vitest";
import { placeTour } from "./tourPlacement";

const view = { width: 1280, height: 800 };
const card = { width: 352, height: 160 };

describe("tour placement", () => {
  it("puts the card under the target, centred on it", () => {
    const p = placeTour({ top: 100, left: 400, width: 200, height: 40 }, card, view);
    // spotlight padded by 6; card 12 below it
    expect(p.spot).toEqual({ top: 94, left: 394, width: 212, height: 52 });
    expect(p.card).toEqual({ top: 158, left: 324 }); // 394 + 106 - 176
  });

  it("flips above when there is no room below", () => {
    const p = placeTour({ top: 700, left: 400, width: 200, height: 40 }, card, view);
    expect(p.card.top).toBe(694 - 12 - 160);
  });

  it("goes beside a target that fills the height, like a sidebar", () => {
    const p = placeTour({ top: 0, left: 0, width: 240, height: 800 }, card, view);
    expect(p.card.left).toBe(240 + 6 + 12); // target right + padding + gap
  });

  it("pins to the bottom when nothing else fits, and never leaves the screen", () => {
    const phone = { width: 390, height: 844 };
    const p = placeTour({ top: 60, left: 16, width: 358, height: 900 }, { width: 358, height: 180 }, phone);
    expect(p.card.top).toBe(844 - 180 - 16);
    expect(p.card.left).toBeGreaterThanOrEqual(16);
    expect(p.card.left + 358).toBeLessThanOrEqual(390 - 16);
    // spotlight clipped to the visible screen
    expect(p.spot!.top + p.spot!.height).toBeLessThanOrEqual(844);
  });

  it("keeps a card for a top-right target inside the right margin", () => {
    const p = placeTour({ top: 6, left: 1230, width: 36, height: 36 }, card, view);
    expect(p.card.left).toBe(1280 - 352 - 16);
  });

  it("centres the card when the target is missing", () => {
    const p = placeTour(null, card, view);
    expect(p.spot).toBeNull();
    expect(p.card).toEqual({ top: 320, left: 464 });
  });
});
