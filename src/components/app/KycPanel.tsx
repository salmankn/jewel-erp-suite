import { api } from "@/convex/_generated/api";
import { Panel, Pill } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/app/SignaturePad";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, FileUp, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

const KINDS = [
  { kind: "AADHAAR_FRONT", label: "Aadhaar front", accept: "image/*,application/pdf" },
  { kind: "AADHAAR_BACK", label: "Aadhaar back", accept: "image/*,application/pdf" },
  { kind: "PAN", label: "PAN card", accept: "image/*,application/pdf" },
  { kind: "PLEDGE_PHOTO", label: "Pledged item photo", accept: "image/*" },
] as const;

/**
 * Module 1 — Customer KYC.
 *
 * Identity papers and photos of the pledged metal upload to Convex storage;
 * the pledge agreement signature is drawn on the pad. Every write is audited
 * and nothing is trusted from the client beyond the file bytes themselves.
 */
export function KycPanel({
  loanId,
  customerId,
}: {
  loanId?: Id<"girviLoans">;
  customerId?: Id<"customers">;
}) {
  const uploadUrl = useMutation(api.kyc.generateUploadUrl);
  const saveDocument = useMutation(api.kyc.saveDocument);
  const [busy, setBusy] = useState<string | null>(null);

  const loanData = useQuery(
    api.kyc.forLoan,
    loanId ? { loanId } : "skip",
  );
  const customerData = useQuery(
    api.kyc.forCustomer,
    customerId ? { customerId } : "skip",
  );

  const data = loanId ? loanData : customerData;
  const documents = data?.documents ?? [];
  const completeness = data?.completeness;

  const handleFile = async (
    kind: (typeof KINDS)[number]["kind"],
    file: File | undefined,
  ) => {
    if (!file) return;
    setBusy(kind);
    try {
      const { url } = await uploadUrl({});
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload rejected (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: string };

      await saveDocument({
        kind,
        storageId,
        loanId,
        customerId,
      });
      toast.success(`${labelFor(kind)} attached.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="KYC & pledge evidence"
      description="Identity papers, photos of the pledged metal, and the signed agreement."
      action={
        completeness ? (
          <Pill tone={completeness.complete ? "safe" : "warn"}>
            {completeness.score}% complete
          </Pill>
        ) : undefined
      }
    >
      <div className="space-y-4 px-5 py-4">
        {completeness && !completeness.complete && (
          <p className="text-xs text-muted-foreground">
            Still needed: <span className="text-foreground">{completeness.missing.join(", ")}</span>
          </p>
        )}

        {/* uploads */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map((k) => (
            <UploadTile
              key={k.kind}
              label={k.label}
              accept={k.accept}
              busy={busy === k.kind}
              onPick={(f) => handleFile(k.kind, f)}
            />
          ))}
        </div>

        {/* signature */}
        <div className="rounded-lg border border-border/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <PenLine className="size-4 text-primary" />
            <div>
              <p className="text-sm font-medium">Pledge agreement signature</p>
              <p className="text-[11px] text-muted-foreground">
                Drawn on screen and stored against this pledge.
              </p>
            </div>
          </div>
          <SignaturePad
            onSave={async (dataUrl) => {
              try {
                await saveDocument({ kind: "SIGNATURE", dataUrl, loanId, customerId });
                toast.success("Signature captured.");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not save signature");
              }
            }}
          />
        </div>

        {/* saved documents */}
        {documents.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              On file
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {documents.map((d) => (
                <li
                  key={d._id}
                  className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  {d.dataUrl ? (
                    <img
                      src={d.dataUrl}
                      alt={data?.labels[d.kind] ?? d.kind}
                      className="h-10 w-14 rounded border border-border bg-white object-contain"
                    />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded bg-muted">
                      <ShieldCheck className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {data?.labels[d.kind] ?? d.kind}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(d.uploadedAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  {d.verified && (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

function UploadTile({
  label,
  accept,
  busy,
  onPick,
}: {
  label: string;
  accept: string;
  busy: boolean;
  onPick: (file: File | undefined) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-4 text-center transition-colors hover:border-primary/50 hover:bg-muted/40 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : (
          <FileUp className="size-5 text-muted-foreground" />
        )}
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          {busy ? "Uploading…" : "Tap to attach"}
        </span>
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}

function labelFor(kind: string): string {
  return KINDS.find((k) => k.kind === kind)?.label ?? kind;
}
