import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  glass = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glass?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border shadow-soft",
        glass ? "glass" : "bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("skeleton rounded-md", className)} {...props} />
  );
}

const BADGE_TONES: Record<string, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  primary: "bg-primary/15 text-secondary border-primary/30",
  secondary: "bg-secondary/15 text-secondary border-secondary/30",
  accent: "bg-accent/15 text-accent border-accent/30",
  violet: "bg-accent-2/15 text-[#c4b5fd] border-accent-2/30",
  success: "bg-success/15 text-[#4ade80] border-success/30",
  destructive: "bg-destructive/15 text-[#f87171] border-destructive/30",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof BADGE_TONES }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

const BTN_VARIANTS: Record<string, string> = {
  brand:
    "brand-gradient text-white hover:brightness-110 shadow-[0_6px_20px_-8px_rgba(99,102,241,0.7)]",
  solid: "bg-primary text-primary-fg hover:bg-secondary",
  outline:
    "border border-border-strong bg-surface-2 text-fg hover:bg-surface-3 hover:border-border-strong",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  success: "bg-success/15 text-[#4ade80] border border-success/40 hover:bg-success/25",
  accent: "bg-accent/15 text-accent border border-accent/40 hover:bg-accent/25",
};

export function Button({
  variant = "solid",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BTN_VARIANTS;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 disabled:cursor-not-allowed disabled:opacity-50",
        BTN_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
