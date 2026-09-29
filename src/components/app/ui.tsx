import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCompactINR } from "@/lib/gehnacloud";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared motion for the workspace primitives.
 *
 * Everything rises a few pixels and fades in, staggered by where it sits on the
 * page, so a panel opening or a stat grid mounting reads as deliberate rather
 * than as a flash. Users who ask for reduced motion get the same layout with no
 * movement.
 */
const EASE = [0.22, 1, 0.36, 1] as const;

function useEnter(delay = 0, y = 8) {
  const reduced = useReducedMotion();
  return {
    initial: reduced ? { opacity: 1 } : { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.32, ease: EASE, delay: reduced ? 0 : delay },
  };
}

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
  index = 0,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Position in a stat row — staggers the entrance so cards cascade in. */
  index?: number;
}) {
  const enter = useEnter(index * 0.06);
  return (
    <motion.div className="rounded-xl border border-border/70 bg-card p-4" {...enter}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className={cn("size-4 shrink-0", tone === "gold" && "text-primary")} />}
      </div>
      <p className="nums mt-2 text-xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

/**
 * Container for a row of stat cards. The cards themselves fade in on mount, so
 * the grid nudges the whole group down slightly to read as one block arriving
 * before the panels below it.
 */
export function StaggerGrid({
  children,
  className,
  delay = 0.05,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const enter = useEnter(delay, 6);
  return (
    <motion.div className={className} {...enter}>
      {children}
    </motion.div>
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
  const enter = useEnter();
  return (
    <motion.section
      className={cn(
        "rounded-xl border border-border/70 bg-card",
        className,
      )}
      {...enter}
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
    </motion.section>
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
  const enter = useEnter(0, 4);
  return (
    <motion.header
      className="flex flex-wrap items-end justify-between gap-4"
      {...enter}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </motion.header>
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
  const enter = useEnter(0, 6);
  return (
    <motion.div
      className="flex flex-col items-center justify-center px-6 py-14 text-center"
      {...enter}
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="mt-3.5 text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </motion.div>
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
