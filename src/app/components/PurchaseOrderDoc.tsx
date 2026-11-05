import { forwardRef } from "react";
import { BUYER, type PurchaseOrder } from "@/domain/po";
import { price, units } from "../format";

const longDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const poDate = (d: string) => longDate.format(new Date(`${d}T12:00:00Z`));

/**
 * The purchase order as a printed page. It always renders as paper (dark
 * ink on white) whatever the app theme is, and uses only the `po-` styles
 * below, so the same markup prints, previews and downloads identically.
 */
export const PurchaseOrderDoc = forwardRef<HTMLElement, { po: PurchaseOrder }>(function PurchaseOrderDoc({ po }, ref) {
  return (
    <article ref={ref} className="po" aria-label={`Purchase order ${po.number}`}>
      <header className="po-head">
        <div className="po-brand">
          <span className="po-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M3 18 9 9l4 5 3-4 5 8z" fill="currentColor" />
            </svg>
          </span>
          <div>
            <div className="po-strong">{po.buyer}</div>
            <div className="po-muted">
              {BUYER.address.map((l) => (
                <div key={l}>{l}</div>
              ))}
              <div>{BUYER.email}</div>
            </div>
          </div>
        </div>
        <div className="po-title">
          <div className="po-h">Purchase order</div>
          <div className="po-num">{po.number}</div>
          <dl className="po-meta">
            <dt>Date</dt>
            <dd>{poDate(po.date)}</dd>
            <dt>Currency</dt>
            <dd>USD</dd>
            <dt>Payment</dt>
            <dd>Net 30</dd>
          </dl>
        </div>
      </header>

      <section className="po-parties">
        <div>
          <div className="po-label">Supplier</div>
          <div className="po-strong">{po.supplier?.name ?? "Unknown supplier"}</div>
          {po.supplier?.contact && <div>Attn: {po.supplier.contact}</div>}
          {po.supplier?.email && <div className="po-muted">{po.supplier.email}</div>}
        </div>
        <div>
          <div className="po-label">Ship to</div>
          {BUYER.shipTo.map((l, i) => (
            <div key={l} className={i === 0 ? "po-strong" : undefined}>
              {l}
            </div>
          ))}
        </div>
      </section>

      <div className="po-table-wrap">
        <table className="po-lines">
          <thead>
            <tr>
              <th>Item</th>
              <th>Our ref.</th>
              <th>Needed by</th>
              <th className="num">Qty</th>
              <th className="num">Unit price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => (
              <tr key={l.orderId}>
                <td>
                  <div className="po-strong">{l.name}</div>
                  <div className="po-muted po-mono">{l.code}</div>
                </td>
                <td className="po-mono">{l.orderName}</td>
                <td>{poDate(l.expectedOn)}</td>
                <td className="num">{units(l.units)}</td>
                <td className="num">{l.unitCost === null ? "To quote" : price(l.unitCost)}</td>
                <td className="num po-strong">{l.total === null ? "To quote" : price(l.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="po-muted">
                {po.lines.length} {po.lines.length === 1 ? "line" : "lines"} · {units(po.lines.reduce((s, l) => s + l.units, 0))} units
              </td>
              <td colSpan={2} className="num">
                Total{po.missingCost ? " (priced lines)" : ""}
              </td>
              <td className="num po-total">{price(po.subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {po.notes.length > 0 && (
        <section className="po-block">
          <div className="po-label">Notes</div>
          {po.notes.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </section>
      )}

      <section className="po-block">
        <div className="po-label">Terms</div>
        <ol className="po-terms">
          {po.terms.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </section>

      <footer className="po-foot">
        Questions about this order? Reply to {BUYER.email} and quote {po.number}.
      </footer>
    </article>
  );
});

/** Shared by the preview, the print view and the downloaded file. */
export const PO_CSS = `
.po{--po-ink:#1c1a17;--po-muted:#6b645b;--po-line:#e6e0d7;--po-soft:#f6f2ec;color:var(--po-ink);background:#fff;font-family:"Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:13px;line-height:1.5;padding:40px 44px;max-width:780px;margin:0 auto;font-variant-numeric:tabular-nums;color-scheme:light}
.po *{box-sizing:border-box}
.po-head{display:flex;justify-content:space-between;gap:24px;padding-bottom:22px;border-bottom:2px solid var(--po-ink)}
.po-brand{display:flex;gap:12px;align-items:flex-start}
.po-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:var(--po-ink);color:#fff;flex-shrink:0}
.po-title{text-align:right}
.po-h{font-size:22px;font-weight:650;letter-spacing:-0.01em}
.po-num{font-family:"Geist Mono",ui-monospace,Menlo,Consolas,monospace;font-size:14px;margin-top:2px}
.po-meta{display:grid;grid-template-columns:auto auto;justify-content:end;gap:2px 14px;margin:12px 0 0}
.po-meta dt{color:var(--po-muted)}
.po-meta dd{margin:0;font-weight:500}
.po-parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:22px 0}
.po-label{font-size:11px;font-weight:600;color:var(--po-muted);margin-bottom:4px}
.po-strong{font-weight:600}
.po-muted{color:var(--po-muted)}
.po-mono{font-family:"Geist Mono",ui-monospace,Menlo,Consolas,monospace;font-size:12px}
.po-table-wrap{overflow-x:auto}
.po-lines{width:100%;border-collapse:collapse;min-width:520px}
.po-lines th{font-size:11px;font-weight:600;color:var(--po-muted);text-align:left;padding:8px 10px;background:var(--po-soft);border-top:1px solid var(--po-line);border-bottom:1px solid var(--po-line)}
.po-lines td{padding:10px;border-bottom:1px solid var(--po-line);vertical-align:top}
.po-lines .num{text-align:right;white-space:nowrap}
.po-lines tfoot td{border-bottom:none;padding-top:14px;font-weight:500}
.po-total{font-size:16px;font-weight:700}
.po-block{margin-top:22px}
.po-terms{margin:0;padding-left:18px;list-style:decimal}
.po-terms li{margin:2px 0}
.po-foot{margin-top:28px;padding-top:14px;border-top:1px solid var(--po-line);color:var(--po-muted);font-size:12px}
@media (max-width:560px){.po{padding:22px 18px;font-size:12px}.po-head{flex-direction:column}.po-title{text-align:left}.po-meta{justify-content:start}.po-parties{grid-template-columns:1fr;gap:14px}}
.po-print-root{display:none}
@media print{
  body.po-printing>*:not(.po-print-root){display:none!important}
  body.po-printing .po-print-root{display:block!important}
  body.po-printing{background:#fff!important}
  .po{padding:0;max-width:none}
  .po-lines{min-width:0}
  @page{margin:14mm}
}
`;
