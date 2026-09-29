import { api } from "@/convex/_generated/api";
import { EmptyState, Panel, Pill } from "@/components/app/ui";
import { formatDate } from "@/lib/gehnacloud";
import { useQuery } from "convex/react";
import {
  CheckCircle2,
  CircleSlash,
  MessageCircle,
  Settings2,
  TriangleAlert,
  XCircle,
} from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
  INTEREST_DUE: "Interest due",
  AUCTION_NOTICE: "Auction notice",
};

const STATUS_TONE = {
  SENT: "safe",
  FAILED: "crit",
  SKIPPED: "warn",
} as const;

function StatusIcon({ status }: { status: string }) {
  if (status === "SENT") return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === "FAILED") return <XCircle className="size-4 text-destructive" />;
  return <CircleSlash className="size-4 text-amber-500" />;
}

/**
 * Dispatch log for every WhatsApp message this workspace has tried to send.
 *
 * Meta only allows free-form text inside a 24-hour service window, so anything
 * outside it is sent as a pre-approved template — that is why the copy is built
 * server-side from the ledger and logged here whether or not it was delivered.
 */
export function OutboxPanel() {
  const outbox = useQuery(api.notify.outbox, {});
  const config = useQuery(api.whatsapp.configured, {});

  const failed = (outbox ?? []).filter((m) => m.status === "FAILED").length;

  return (
    <Panel
      title="WhatsApp outbox"
      description="Every message composed from the ledger, with its delivery result."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {failed > 0 && <Pill tone="crit">{failed} failed</Pill>}
          <Pill tone="neutral">
            <MessageCircle className="size-3" />
            {outbox?.length ?? 0} sent
          </Pill>
          <Pill tone={config?.ready ? "safe" : "warn"}>
            {config?.ready ? (
              <>
                <CheckCircle2 className="size-3" />
                Connected
              </>
            ) : (
              <>
                <TriangleAlert className="size-3" />
                Not configured
              </>
            )}
          </Pill>
        </div>
      }
    >
      {!config?.ready && (
        <div className="flex flex-wrap items-start gap-2 border-b border-border/70 bg-amber-500/8 px-5 py-3 text-xs">
          <Settings2 className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-700 dark:text-amber-400">
            Messages will be logged as <strong>skipped</strong> until{" "}
            <code className="font-mono">WHATSAPP_TOKEN</code> and{" "}
            <code className="font-mono">WHATSAPP_PHONE_NUMBER_ID</code> are added in the
            Keys tab. Template name in use:{" "}
            <code className="font-mono">{config?.template ?? "GIRVI_UPDATE"}</code>.
          </p>
        </div>
      )}

      {!outbox ? (
        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
          Loading dispatch log…
        </div>
      ) : outbox.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="Nothing sent yet"
          hint="Interest reminders, invoices and auction notices appear here once dispatched."
        />
      ) : (
        <ul className="divide-y divide-border/70">
          {outbox.map((m) => (
            <li key={m._id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3">
              <span className="mt-0.5">
                <StatusIcon status={m.status} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={STATUS_TONE[m.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                    {m.status}
                  </Pill>
                  <span className="text-[13px] font-medium">
                    {KIND_LABEL[m.kind] ?? m.kind}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    +91 {m.to.replace(/\D/g, "").slice(-10)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                  {m.body}
                </p>
                {m.error && (
                  <p className="mt-1 text-[11px] text-destructive">{m.error}</p>
                )}
              </div>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                {formatDate(m.sentAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
