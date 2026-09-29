import { api } from "@/convex/_generated/api";
import { EmptyState, Panel, Pill } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/gehnacloud";
import { useQuery } from "convex/react";
import { Activity, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

/** Actions that move money or metal get a louder pill in the trail. */
function toneFor(action: string): "crit" | "warn" | "info" | "neutral" {
  if (action.includes("SETTLED") || action.includes("STOCK_STATUS")) return "info";
  if (
    action.includes("SUSPEND") ||
    action.includes("AUCTION") ||
    action.includes("RELEASE") ||
    action.includes("CHUDAI")
  )
    return "crit";
  if (action.includes("WRITE") || action.includes("PLAN_CHANGED") || action.includes("ROLE"))
    return "warn";
  return "neutral";
}

/**
 * Append-only audit trail across every tenant.
 *
 * The server caps a single read at 120 rows, so filtering happens against that
 * window rather than re-querying per keystroke — the trail is a compliance view,
 * not a search index.
 */
export function AuditTrail({
  tenants,
}: {
  tenants: { _id: Id<"tenants">; businessName: string }[];
}) {
  const [tenantId, setTenantId] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const logs = useQuery(
    api.admin.auditTrail,
    tenantId === "ALL" ? {} : { tenantId: tenantId as Id<"tenants"> },
  );

  const tenantName = useMemo(() => {
    const map = new Map(tenants.map((t) => [t._id as string, t.businessName]));
    return (id?: string) => (id ? (map.get(id) ?? "Unknown tenant") : "Platform");
  }, [tenants]);

  const term = search.trim().toLowerCase();
  const filtered = (logs ?? []).filter(
    (l) =>
      !term ||
      l.action.toLowerCase().includes(term) ||
      l.entity.toLowerCase().includes(term) ||
      l.actor.toLowerCase().includes(term) ||
      (l.detail ?? "").toLowerCase().includes(term),
  );

  return (
    <Panel
      title="Audit trail"
      description="Append-only across every tenant. Financial and stock writes are never silently editable."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="neutral">
            <Activity className="size-3" />
            {term || tenantId !== "ALL"
              ? `${filtered.length} of ${logs?.length ?? 0}`
              : (logs?.length ?? 0)}{" "}
            entries
          </Pill>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            aria-label="Filter by tenant"
          >
            <option value="ALL">All tenants</option>
            {tenants.map((t) => (
              <option key={t._id} value={t._id}>
                {t.businessName}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action, actor, detail…"
              className="h-8 w-52 pl-7 text-xs"
            />
          </div>
          {(term || tenantId !== "ALL") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearch("");
                setTenantId("ALL");
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
        </div>
      }
    >
      {!logs ? (
        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
          Loading trail…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={logs.length === 0 ? "No activity recorded yet" : "Nothing matches that filter"}
          hint={
            logs.length === 0
              ? "Tenant and platform actions will appear here as they happen."
              : "Try a different action name, or reset the filters."
          }
        />
      ) : (
        <ul className="divide-y divide-border/70">
          {filtered.map((l) => (
            <li
              key={l._id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5"
            >
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatDate(l.at)}
              </span>
              <Pill tone={toneFor(l.action)}>{l.action.replace(/_/g, " ")}</Pill>
              <span className="text-[13px]">{l.detail ?? `${l.entity} written`}</span>
              <span className="ml-auto flex items-baseline gap-2 text-[11px] text-muted-foreground">
                <span>{tenantName(l.tenantId)}</span>
                <span>·</span>
                <span className="font-mono">{l.actor}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
