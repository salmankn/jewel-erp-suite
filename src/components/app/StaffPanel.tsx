import { api } from "@/convex/_generated/api";
import { Panel, Pill } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ROLE_LABELS } from "@/lib/gehnacloud";
import { useMutation, useQuery } from "convex/react";
import { Loader2, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ROLES } from "@/convex/schema";

const ASSIGNABLE = [
  ROLES.STORE_OWNER,
  ROLES.SALES_STAFF,
  ROLES.GIRVI_OPERATOR,
  ROLES.ACCOUNTANT,
] as const;

const TONE: Record<string, "gold" | "safe" | "info" | "warn"> = {
  STORE_OWNER: "gold",
  SALES_STAFF: "info",
  GIRVI_OPERATOR: "warn",
  ACCOUNTANT: "safe",
};

/**
 * Staff and subscription management.
 *
 * Seats and stock items are capped by the tenant's plan — the counts here come
 * straight from the same guard the write paths enforce, so what the owner sees
 * is what the server will allow.
 */
export function StaffPanel({ isOwner }: { isOwner: boolean }) {
  const usage = useQuery(api.usage.usage, {});
  const members = useQuery(api.usage.members, {});
  const invite = useMutation(api.bootstrap.inviteMember);
  const changeRole = useMutation(api.usage.changeRole);
  const removeMember = useMutation(api.usage.removeMember);
  const renew = useMutation(api.usage.renewLicence);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ASSIGNABLE)[number]>("SALES_STAFF");
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* subscription */}
      <Panel
        title="Subscription"
        description={usage?.plan ? `${usage.plan.label} · ${usage.plan.blurb}` : undefined}
        className="lg:col-span-2"
        action={
          usage?.expired ? (
            <Pill tone="crit">Lapsed</Pill>
          ) : usage?.trialLeftDays != null && usage.trialLeftDays > 0 ? (
            <Pill tone="warn">{usage.trialLeftDays}d trial left</Pill>
          ) : (
            <Pill tone="safe">Active</Pill>
          )
        }
      >
        {usage && (
          <div className="space-y-4 px-5 py-4">
            <UsageBar
              label="Stock items"
              used={usage.items}
              max={usage.limits.maxItems}
              pct={usage.usagePct.items}
            />
            <UsageBar
              label="Staff seats"
              used={usage.seats}
              max={usage.limits.maxStaff}
              pct={usage.usagePct.seats}
            />

            {!usage.girviEnabled && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                GehnaGirvi is not included on this plan. Upgrade to Girvi Enterprise to
                run pledge books.
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const n = await renew({ months: 12 });
                    toast.success(`Licence renewed for 12 months (${n} workspace(s)).`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not renew");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Renew 12 months
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* staff */}
      <Panel
        title="Staff & roles"
        description="Role decides which modules this person can open — enforced server-side."
        className="lg:col-span-3"
      >
        <div className="divide-y divide-border/70">
          {(members ?? []).map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Users className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{m.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{m.email}</p>
              </div>
              <Pill tone={TONE[m.role] ?? "neutral"}>{ROLE_LABELS[m.role]}</Pill>
              {isOwner && (
                <div className="flex items-center gap-1.5">
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-[11px]"
                    value={m.role}
                    onChange={async (e) => {
                      try {
                        await changeRole({
                          membershipId: m.id,
                          role: e.target.value as (typeof ASSIGNABLE)[number],
                        });
                        toast.success(`${m.name} is now ${ROLE_LABELS[e.target.value as never]}.`);
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Could not change role",
                        );
                      }
                    }}
                  >
                    {ASSIGNABLE.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await removeMember({ membershipId: m.id });
                        toast.success(`${m.name} removed from this workspace.`);
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Could not remove",
                        );
                      }
                    }}
                    aria-label={`Remove ${m.name}`}
                  >
                    <UserMinus className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!members?.length && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No staff on this workspace yet.
            </p>
          )}
        </div>

        {isOwner && (
          <div className="flex flex-wrap items-end gap-2 border-t border-border/70 px-5 py-4">
            <label className="block flex-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Invite by email (they must have signed in once)
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@manglamjewellers.in"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              />
            </label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              {ASSIGNABLE.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!email || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await invite({ email: email.trim(), role });
                  toast.success("Seat granted.");
                  setEmail("");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not invite");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-4" />}
              Grant seat
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

function UsageBar({
  label,
  used,
  max,
  pct,
}: {
  label: string;
  used: number;
  max: number;
  pct: number;
}) {
  const near = pct >= 85;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="nums font-medium">
          {used.toLocaleString("en-IN")} / {max.toLocaleString("en-IN")}
        </span>
      </div>
      <Progress value={pct} className="mt-1.5 h-1.5" />
      {near && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-destructive">
          <ShieldCheck className="size-3" />
          Near the plan limit — upgrades are blocked past 100%.
        </p>
      )}
    </div>
  );
}
