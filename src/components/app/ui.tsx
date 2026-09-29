import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCompactINR } from "@/lib/gehnacloud";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Tones used across risk, status and money pills. */
export type Tone = "neutral" | "gold" | "safe" | "warn" | "crit" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  gold: "border-primary/40 bg-primary/12 text-primary",
  safe: "border-emerald-500/35 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  warn: "border-amber-500/40 bg-amber-500/12 text-amber-700 dark:text-amber-400",
  crit: "border-destructive/40 bg-destructive/12 text-destructive",
  info: "border-sky-500/35 bg-sky-500/12 text-sky-700 dark:text-sky-400",
};

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className={cn("size-4 shrink-0", tone === "gold" && "text-primary")} />}
      </div>
      <p className="nums mt-2 text-xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/70 bg-card",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div>
            {title && (
              <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="mt-3.5 text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Money that stays legible in dense tables — full value on hover. */
export function Money({ value, precise = false }: { value: number; precise?: boolean }) {
  return (
    <span className="nums" title={formatCompactINR(value)}>
      {precise
        ? `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `₹${Math.round(value).toLocaleString("en-IN")}`}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export { Badge };
