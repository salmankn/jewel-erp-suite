import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/components/app/AppShell";
import { Panel, Pill } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { formatDate, formatINR } from "@/lib/gehnacloud";
import { useQuery } from "convex/react";
import { Download, FileSpreadsheet, Info } from "lucide-react";
import { toast } from "sonner";

/**
 * GSTR-1 (outward supplies) and GSTR-3B (summary) CSV exports.
 *
 * The portal expects DD-MM-YYYY dates, a BOM for Excel to read ₹ correctly,
 * and every field quoted defensively — a customer name with a comma must never
 * shift a column in the accountant's upload.
 */
function esc(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

/** GST portal convention: DD-MM-YYYY. */
function gstDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function download(filename: string, csv: string) {
  // Leading BOM stops Excel mangling the rupee sign and Devanagari.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const round = (n: number) => Math.round(n * 100) / 100;

export function GstExports() {
  const { tenant } = useWorkspace();
  const report = useQuery(api.billing.gstReport, {});

  if (!report) {
    return (
      <Panel title="GST returns">
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          Compiling return data…
        </div>
      </Panel>
    );
  }

  const period = new Date().toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  })
    .replace(/\s+/g, "-")
    .toUpperCase();

  /** GSTR-1: invoice-wise outward supply with the CGST/SGST/IGST split. */
  const exportGstr1 = () => {
    const rows: (string | number)[][] = [
      [
        "GSTIN",
        "Receiver Name",
        "Invoice Number",
        "Invoice Date",
        "Invoice Type",
        "Place Of Supply",
        "Taxable Value",
        "CGST",
        "SGST",
        "IGST",
        "Invoice Value",
      ],
      ...report.b2b.map((r) => [
        "",
        r.customerName,
        r.invoiceNumber,
        gstDate(r.date),
        "Regular B2B",
        `${tenant.state ?? ""}-${String(tenant.gstin ?? "").slice(0, 2)}`,
        round(r.taxableValue),
        round(r.cgst),
        round(r.sgst),
        round(r.igst),
        round(r.total),
      ]),
    ];
    download(`GSTR1_${tenant.subdomain}_${period}.csv`, toCsv(rows));
    toast.success(`GSTR-1 exported — ${report.b2b.length} invoices.`);
  };

  /** GSTR-3B: one summary row for the return period. */
  const exportGstr3b = () => {
    const s = report.summary3B;
    const rows: (string | number)[][] = [
      ["GSTIN", "Return Period", "Invoice Count", "Taxable Value", "CGST", "SGST", "IGST", "Total Tax"],
      [
        tenant.gstin ?? "",
        period,
        s.invoiceCount,
        round(s.taxableValue),
        round(s.cgst),
        round(s.sgst),
        round(s.igst),
        round(s.totalTax),
      ],
    ];
    download(`GSTR3B_${tenant.subdomain}_${period}.csv`, toCsv(rows));
    toast.success("GSTR-3B summary exported.");
  };

  const s = report.summary3B;

  return (
    <Panel
      title="GST returns"
      description={`Ready-to-upload CSVs for ${period}. Figures cover every invoice raised in this workspace.`}
      action={
        <Pill tone="gold">
          <FileSpreadsheet className="size-3" />
          {s.invoiceCount} invoices
        </Pill>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Taxable value", value: s.taxableValue },
            { label: "CGST", value: s.cgst },
            { label: "SGST", value: s.sgst },
            { label: "IGST", value: s.igst },
            { label: "Total tax", value: s.totalTax },
          ].map((row) => (
            <div key={row.label} className="rounded-lg bg-muted/60 px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {row.label}
              </dt>
              <dd className="nums mt-0.5 text-sm font-semibold">
                {formatINR(row.value)}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={exportGstr1}>
            <Download className="size-4" />
            Download GSTR-1 (invoices)
          </Button>
          <Button size="sm" variant="outline" onClick={exportGstr3b}>
            <Download className="size-4" />
            Download GSTR-3B (summary)
          </Button>
        </div>

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Files are generated in the browser from the same server-side ledger the
          invoices were priced with, so the totals always reconcile with the bill
          register. Recipient GSTIN is left blank for walk-in retail bills — add the
          customer's GSTIN before upload if you raised a B2B invoice.
        </p>

        {report.b2b.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/70 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Invoice</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 text-right font-medium">Taxable</th>
                  <th className="px-3 py-2 text-right font-medium">Tax</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {report.b2b.slice(0, 8).map((r) => (
                  <tr key={r.invoiceNumber}>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {r.invoiceNumber}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-3 py-2">{r.customerName}</td>
                    <td className="nums px-3 py-2 text-right">
                      {formatINR(r.taxableValue)}
                    </td>
                    <td className="nums px-3 py-2 text-right text-muted-foreground">
                      {formatINR(r.cgst + r.sgst + r.igst)}
                    </td>
                    <td className="nums px-3 py-2 text-right font-semibold">
                      {formatINR(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.b2b.length > 8 && (
              <p className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
                + {report.b2b.length - 8} more in the CSV export
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
