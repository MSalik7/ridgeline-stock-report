/**
 * Where the tour's spotlight and card go. Pure, so it is tested without a
 * browser: the spotlight is the visible part of the target; the card sits
 * below it, else above, else beside it, else pinned to the bottom.
 */
export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Placement {
  spot: Box | null;
  card: { top: number; left: number };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function placeTour(
  target: Box | null,
  card: { width: number; height: number },
  view: { width: number; height: number },
  { gap = 12, margin = 16, pad = 6 } = {},
): Placement {
  if (!target) {
    return { spot: null, card: { top: Math.max(margin, (view.height - card.height) / 2), left: Math.max(margin, (view.width - card.width) / 2) } };
  }
  const edge = margin / 2;
  const top = clamp(target.top - pad, edge, view.height - edge);
  const bottom = clamp(target.top + target.height + pad, edge, view.height - edge);
  const left = clamp(target.left - pad, edge, view.width - edge);
  const right = clamp(target.left + target.width + pad, edge, view.width - edge);
  const spot = { top, left, width: right - left, height: bottom - top };

  const centred = clamp(spot.left + spot.width / 2 - card.width / 2, margin, Math.max(margin, view.width - card.width - margin));
  if (spot.top + spot.height + gap + card.height <= view.height - margin) {
    return { spot, card: { top: spot.top + spot.height + gap, left: centred } };
  }
  if (spot.top - gap - card.height >= margin) {
    return { spot, card: { top: spot.top - gap - card.height, left: centred } };
  }
  if (spot.left + spot.width + gap + card.width <= view.width - margin) {
    return { spot, card: { top: clamp(spot.top, margin, view.height - card.height - margin), left: spot.left + spot.width + gap } };
  }
  return { spot, card: { top: Math.max(margin, view.height - card.height - margin), left: centred } };
}
