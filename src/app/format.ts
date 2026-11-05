const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 1,240 */
export function units(n: number): string {
  return int.format(n);
}

/** 16.4 */
export function dec1(n: number): string {
  return one.format(n);
}

/** "30.5 d", or "—" when there's no sales speed to divide by. */
export function days(n: number | null, suffix = " d"): string {
  if (n === null) return "—";
  return `${one.format(n)}${suffix}`;
}

/** 1.40× */
export function factor(n: number): string {
  return `${n.toFixed(2)}×`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${units(n)} ${n === 1 ? one : many}`;
}

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$12,480" for totals; small amounts keep their cents ("$86.40"). */
export function money(n: number): string {
  return Math.abs(n) >= 1000 ? usd0.format(n) : usd2.format(n);
}

/** "$21.50": unit prices always show cents. */
export function price(n: number): string {
  return usd2.format(n);
}

/** "$48.2k" for tight spaces. */
export function moneyShort(n: number): string {
  if (Math.abs(n) < 1000) return usd0.format(n);
  return `$${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
}
