import { Card, Skeleton } from "./ui";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  primary: "bg-primary/15 text-secondary",
  secondary: "bg-secondary/15 text-secondary",
  accent: "bg-accent/15 text-accent",
  violet: "bg-accent-2/15 text-[#c4b5fd]",
  success: "bg-success/15 text-[#4ade80]",
};

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "secondary",
  featured = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: keyof typeof TONES;
  featured?: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong",
        featured && "border-secondary/30",
      )}
    >
      {featured ? (
        <div className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-gradient-to-br from-secondary/25 via-accent-2/15 to-transparent blur-2xl" />
      ) : null}
      <div className="relative flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg",
            featured ? "brand-gradient text-white" : TONES[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <div className="tnum relative mt-3 text-2xl font-semibold tracking-tight sm:text-[1.7rem]">
        {value}
      </div>
      {hint ? (
        <div className="relative mt-1 text-xs text-muted">{hint}</div>
      ) : null}
    </Card>
  );
}

export function KpiSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <Skeleton className="mt-4 h-7 w-24" />
      <Skeleton className="mt-2 h-3 w-16" />
    </Card>
  );
}
