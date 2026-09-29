import { Button } from "@/components/ui/button";
import {
  METAL_LABELS,
  PURITY_LABELS,
  formatGrams,
  formatINR,
} from "@/lib/gehnacloud";
import QRCode from "qrcode";
import { Printer, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface TagItem {
  _id: string;
  itemName: string;
  huidNumber: string;
  barcode: string;
  rfidTag?: string;
  category: string;
  metalType: string;
  purityKarat: number;
  netWeight: number;
  makingChargePerGram: number;
  purchaseRate: number;
}

/**
 * Module 2 — thermal jewellery tags.
 *
 * Sized for a 58 mm × 40 mm thermal roll, which is the standard tag stock for
 * Indian jewellery counters. Every tag carries the BIS HUID, the RFID tag id
 * and a QR encoding the same record so a phone camera can pull it up at audit.
 */
export function TagPrint({
  items,
  businessName,
  gstin,
  onClose,
}: {
  items: TagItem[];
  businessName: string;
  gstin?: string;
  onClose: () => void;
}) {
  const [qr, setQr] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        items.map(async (it) => {
          // The QR payload is what an auditor scans back into the stock book.
          const payload = JSON.stringify({
            huid: it.huidNumber,
            item: it.itemName,
            metal: it.metalType,
            karat: it.purityKarat,
            net: it.netWeight,
            rfid: it.rfidTag,
          });
          const url = await QRCode.toDataURL(payload, {
            margin: 0,
            width: 220,
            errorCorrectionLevel: "M",
          });
          return [it._id, url] as const;
        }),
      );
      if (!cancelled) setQr(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const print = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Thermal tag preview
          </h2>
          <p className="text-xs text-muted-foreground">
            {items.length} tag{items.length > 1 ? "s" : ""} · 58mm roll · HUID + QR
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={print}>
            <Printer className="size-4" />
            Print
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <div
            key={it._id}
            className="tag-print rounded-lg border-2 border-foreground/80 bg-white p-3 text-[#111]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold leading-tight">
                  {it.itemName}
                </p>
                <p className="text-[9px] uppercase tracking-wide text-neutral-600">
                  {businessName}
                </p>
              </div>
              {qr[it._id] && (
                <img
                  src={qr[it._id]}
                  alt={`QR for HUID ${it.huidNumber}`}
                  className="size-16 shrink-0"
                />
              )}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
              <Field label="HUID" value={it.huidNumber} mono />
              <Field
                label="Metal"
                value={`${METAL_LABELS[it.metalType] ?? it.metalType} ${PURITY_LABELS[it.purityKarat] ?? it.purityKarat}`}
              />
              <Field label="Net wt" value={`${it.netWeight.toFixed(3)} g`} mono />
              <Field label="Making" value={`₹${it.makingChargePerGram}/g`} mono />
              <Field label="RFID" value={it.rfidTag ?? "—"} mono />
              <Field label="Barcode" value={it.barcode} mono />
            </div>

            <div className="mt-2 flex items-end justify-between border-t border-dashed border-neutral-400 pt-1.5">
              <p className="text-[9px] leading-tight text-neutral-700">
                BIS Hallmarked · 100% BIS Hallmarked
                {gstin ? ` · GSTIN ${gstin}` : ""}
              </p>
              <p className="text-[11px] font-bold">{formatINR(it.netWeight * it.purchaseRate)}</p>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .tag-print, .tag-print * { visibility: visible; }
          .tag-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 58mm;
            page-break-inside: avoid;
            border: 1px dashed #000;
          }
          .print-hide { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-1">
      <span className="text-neutral-500">{label}</span>
      <span className={`truncate font-semibold ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export { formatGrams };
