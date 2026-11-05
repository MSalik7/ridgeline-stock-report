/**
 * The stock report as a table: downloaded as CSV, or copied as
 * tab-separated text that pastes straight into a spreadsheet, email or chat.
 */
import { toast } from "sonner";
import { formatDay } from "@/domain/dates";
import { STATUS_LABEL } from "@/domain/forecast";
import type { Report } from "@/domain/report";

const HEADER = [
  "Code",
  "Product",
  "Status",
  "In warehouse",
  "Sold, not shipped",
  "Sold 7 days",
  "Daily burn",
  "Trend factor",
  "Sells per day",
  "Days of stock",
  "Placed",
  "In production",
  "On the way",
  "Days with everything ordered",
  "Sells out on",
  "Reorder by",
  "Suggested order",
  "Runs out before next delivery",
];

function rows(report: Report): string[][] {
  const n = (x: number | null, d = 1) => (x === null ? "" : x.toFixed(d));
  return report.products.map((r) => {
    const f = r.forecast;
    return [
      r.product.code,
      r.product.name,
      STATUS_LABEL[f.status] + (f.flags.orderedNotEnough ? " (even with open orders)" : ""),
      String(r.stock),
      String(r.unshipped),
      String(f.sold7),
      n(f.dailyBurn, 2),
      n(f.trendFactor, 2),
      n(f.adjustedBurn),
      n(f.daysOfStock),
      String(r.placed),
      String(r.inProduction),
      String(r.onTheWay),
      n(f.daysWithOrdered),
      f.sellsOutOn ?? "",
      f.reorderBy ?? "",
      String(f.suggestedOrder),
      r.outlook.runsOutOn ? `${r.outlook.runsOutOn}${r.outlook.nextStock ? ` until ${r.outlook.nextStock.expectedOn}` : ""}` : "",
    ];
  });
}

function csv(report: Report) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [HEADER, ...rows(report)].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

function tsv(report: Report) {
  return [HEADER, ...rows(report)].map((r) => r.map((v) => v.replace(/\s+/g, " ")).join("\t")).join("\n");
}

interface DownloadsApi {
  save(r: { filename: string; data: string }): Promise<unknown>;
}

export async function downloadStockCsv(report: Report) {
  const filename = `stock-report-${report.today}.csv`;
  const data = csv(report);
  const rt = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (rt?.use) {
    const dl = (await rt.use("downloads")) as DownloadsApi | null;
    if (!dl) {
      toast.error("Downloads aren't available in this view. Use “Copy as table” instead.");
      return;
    }
    try {
      await dl.save({ filename, data });
      toast.success(`Saved ${filename}`);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "declined") toast.error("The file couldn't be saved here. Use “Copy as table” instead.");
    }
    return;
  }
  // Running outside Claude (local development): a normal browser download.
  const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyStockTable(report: Report) {
  try {
    await navigator.clipboard.writeText(tsv(report));
    toast.success(`Copied ${report.products.length} products as of ${formatDay(report.today)}. Paste into a sheet, email or chat.`);
  } catch {
    toast.error("Copying isn't allowed in this view. Use “Download CSV” instead.");
  }
}
