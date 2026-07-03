"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  MessagesSquare,
  KanbanSquare,
  Bot,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ReactNode };

function buildNav(slug: string): NavItem[] {
  return [
    {
      href: `/${slug}`,
      label: "Visão geral",
      icon: <LayoutDashboard className="size-4" />,
    },
    {
      href: `/${slug}/conversas`,
      label: "Conversas",
      icon: <MessagesSquare className="size-4" />,
    },
    {
      href: `/${slug}/pipeline`,
      label: "Pipeline",
      icon: <KanbanSquare className="size-4" />,
    },
  ];
}

function useActive() {
  const pathname = usePathname();
  return (href: string, base: string) => {
    if (href === base) return pathname === base;
    return pathname === href || pathname.startsWith(href + "/");
  };
}

export function Sidebar({
  slug,
  name,
  persona,
}: {
  slug: string;
  name: string;
  persona: string;
}) {
  const nav = buildNav(slug);
  const isActive = useActive();
  const base = `/${slug}`;

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface/60 px-3 py-5 backdrop-blur lg:flex">
      <Link
        href="/"
        className="mb-6 flex items-center gap-1.5 px-2 text-xs font-medium text-muted transition-colors hover:text-fg"
      >
        <ChevronLeft className="size-3.5" />
        Todos os agentes
      </Link>

      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="grid size-10 place-items-center rounded-xl bg-primary/20 text-secondary ring-1 ring-primary/40">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold leading-tight">{name}</div>
          <div className="text-xs text-muted">Persona {persona}</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {nav.map((item) => {
          const active = isActive(item.href, base);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                active
                  ? "bg-primary/15 text-fg ring-1 ring-inset ring-primary/30"
                  : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <span className={active ? "text-secondary" : ""}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 text-[11px] text-muted-2">
        Central de Agentes IA
      </div>
    </aside>
  );
}

export function Topbar({
  slug,
  name,
  persona,
}: {
  slug: string;
  name: string;
  persona: string;
}) {
  const [open, setOpen] = useState(false);
  const nav = buildNav(slug);
  const isActive = useActive();
  const base = `/${slug}`;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/80 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/20 text-secondary ring-1 ring-primary/40">
          <Bot className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-[11px] text-muted">Persona {persona}</div>
        </div>
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        className="grid size-9 place-items-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-fg"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full border-b border-border bg-surface p-3 shadow-xl">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="mb-2 flex items-center gap-1.5 px-2 text-xs text-muted"
          >
            <ChevronLeft className="size-3.5" /> Todos os agentes
          </Link>
          <nav className="flex flex-col gap-1">
            {nav.map((item) => {
              const active = isActive(item.href, base);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    active
                      ? "bg-primary/15 text-fg"
                      : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
