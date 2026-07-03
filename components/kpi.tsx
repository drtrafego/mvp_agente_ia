import { Card, Skeleton } from "./ui";

const TONES: Record<string, string> = {
  primary: "bg-primary/15 text-secondary",
  secondary: "bg-secondary/15 text-secondary",
  accent: "bg-accent/15 text-accent",
  success: "bg-success/15 text-[#4ade80]",
};

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "secondary",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <Card className="p-4 transition-colors duration-200 hover:border-border-strong">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        <span className={`grid size-8 place-items-center rounded-lg ${TONES[tone]}`}>
          {icon}
        </span>
      </div>
      <div className="tnum mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
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
