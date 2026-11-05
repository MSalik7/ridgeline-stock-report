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
