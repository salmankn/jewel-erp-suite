import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { canAccess, formatINR, ROLE_LABELS } from "@/lib/gehnacloud";
import { useMutation, useQuery } from "convex/react";
import {
  Boxes,
  Gem,
  LayoutDashboard,
  Loader2,
  LogOut,
  Receipt,
  Scale,
  Shield,
  ShoppingCart,
  TrendingUp,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, createContext, useContext, useMemo } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import type { Doc } from "@/convex/_generated/dataModel";
import type { Role } from "@/convex/schema";
import { Pill } from "./ui";

export interface WorkspaceValue {
  tenant: Doc<"tenants">;
  role: Role;
  user: Doc<"users">;
  isSuperAdmin: boolean;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <AppShell />.");
  return ctx;
}

/** Blocks a module the signed-in role is not cleared for. */
export function RequireModule({
  module,
  children,
}: {
  module: string;
  children: React.ReactNode;
}) {
  const { role } = useWorkspace();
  if (!canAccess(role, module)) {
    return (
      <div className="rounded-xl border border-border/70 bg-card px-6 py-16 text-center">
        <Shield className="mx-auto size-8 text-primary" />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          Restricted module
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Your role is <strong className="text-foreground">{ROLE_LABELS[role]}</strong>,
          which does not include the {module} module. Access is enforced on the server,
          not just hidden from the menu.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/app">Back to overview</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, module: "dashboard", end: true },
  { to: "/app/pos", label: "Billing & GST", icon: Receipt, module: "pos", end: false },
  { to: "/app/purchases", label: "Purchases", icon: ShoppingCart, module: "purchases", end: false },
  { to: "/app/inventory", label: "Inventory", icon: Boxes, module: "inventory", end: false },
  { to: "/app/girvi", label: "GehnaGirvi", icon: Scale, module: "girvi", end: false },
  { to: "/app/karigar", label: "Karigar", icon: Wrench, module: "karigar", end: false },
  { to: "/app/customers", label: "Customers", icon: Users, module: "customers", end: false },
  { to: "/app/reports", label: "Reports", icon: TrendingUp, module: "reports", end: false },
  { to: "/app/team", label: "Team & plan", icon: UserCog, module: "reports", end: false },
] as const;

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const context = useQuery(api.bootstrap.context);
  const ensureWorkspace = useMutation(api.bootstrap.ensureWorkspace);
  const rates = useQuery(api.rates.board);

  const unlinked = context?.kind === "unlinked";

  // Tenant Lifecycle Engine: provision this jeweller's isolated schema on
  // first sight. Idempotent, so it is safe on every mount.
  useEffect(() => {
    if (unlinked) ensureWorkspace();
  }, [unlinked, ensureWorkspace]);

  const value = useMemo<WorkspaceValue | null>(() => {
    if (!context || context.kind === "unlinked") return null;
    if (context.kind === "platform") {
      // A platform operator with no jeweller membership has no tenant schema
      // to query — synthesising one here would make every page query throw.
      return null;
    }
    return {
      tenant: context.tenant,
      role: context.role,
      user: context.user,
      isSuperAdmin: context.user.role === "SUPER_ADMIN",
    };
  }, [context]);

  const needsWorkspace = context?.kind === "platform";

  if (needsWorkspace) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Shield className="size-6" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            No jeweller workspace linked
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            You are a platform operator. Open a jeweller workspace to see the store
            modules, or head to the Super Admin console.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link to="/admin">Go to platform console</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await ensureWorkspace();
            }}
          >
            Provision my workspace
          </Button>
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Provisioning your jeweller workspace…
        </p>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const headline = rates?.filter((r) => r.purityKarat === 22 || r.purityKarat === 925) ?? [];

  return (
    <WorkspaceContext.Provider value={value}>
      <div className="dark min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen">
          {/* ── sidebar ── */}
          <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
            <Link to="/app" className="flex items-center gap-2.5 px-5 py-5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Gem className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight">
                  {value.tenant.businessName}
                </span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {value.tenant.subdomain}.gehnacloud
                </span>
              </span>
            </Link>

            <Separator />

            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {NAV.filter((n) => canAccess(value.role, n.module)).map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-sidebar-primary/15 font-medium text-sidebar-primary"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                      )
                    }
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            <div className="space-y-3 border-t border-sidebar-border p-3">
              <div className="rounded-lg bg-sidebar-accent/50 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Signed in as
                </p>
                <p className="mt-0.5 truncate text-xs font-medium">
                  {value.user.name || value.user.email}
                </p>
                <p className="mt-1 text-[11px] text-primary">{ROLE_LABELS[value.role]}</p>
              </div>

              {value.isSuperAdmin && (
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <Link to="/admin">Platform admin</Link>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={handleSignOut}
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            </div>
          </aside>

          {/* ── main ── */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
              <div className="flex h-14 items-center justify-between gap-4 px-5">
                <div className="flex items-center gap-2 lg:hidden">
                  <Gem className="size-5 text-primary" />
                  <span className="text-sm font-semibold">GehnaCloud</span>
                </div>

                <div className="hidden items-center gap-2 lg:flex">
                  <Pill tone="gold">
                    <span className="size-1.5 rounded-full bg-primary" />
                    Live board
                  </Pill>
                  {headline.map((r) => (
                    <span
                      key={r._id}
                      className="nums text-xs text-muted-foreground"
                    >
                      {r.metalType === "GOLD" ? "22K" : "925 Ag"} ₹
                      {r.ratePerGram.toLocaleString("en-IN")}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Pill tone="neutral">{value.tenant.planTier.replace(/_/g, " ")}</Pill>
                  <Pill tone={value.tenant.status === "ACTIVE" ? "safe" : "warn"}>
                    {value.tenant.status}
                  </Pill>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    onClick={handleSignOut}
                    aria-label="Sign out"
                  >
                    <LogOut className="size-4" />
                  </Button>
                </div>
              </div>

              {/* mobile nav */}
              <nav className="flex gap-1 overflow-x-auto border-t border-border/60 px-3 py-2 lg:hidden">
                {NAV.filter((n) => canAccess(value.role, n.module)).map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
                          isActive
                            ? "bg-primary/15 font-medium text-primary"
                            : "text-muted-foreground",
                        )
                      }
                    >
                      <Icon className="size-3.5" />
                      {item.label}
                    </NavLink>
                  );
                })}
              </nav>
            </header>

            <main className="flex-1 px-5 py-6">
              <div className="mx-auto w-full max-w-6xl">
                <Outlet />
              </div>
            </main>

            <footer className="border-t border-border/60 px-5 py-4">
              <p className="mx-auto max-w-6xl text-[11px] text-muted-foreground">
                Isolated schema{" "}
                <code className="font-mono text-primary">{value.tenant.schemaName}</code> ·
                Every stock, loan and ledger write is audited. Prices shown exclude
                GST unless stated.
              </p>
            </footer>
          </div>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

/** Shared helper for pages that want the tenant's money formatted consistently. */
export { formatINR };
