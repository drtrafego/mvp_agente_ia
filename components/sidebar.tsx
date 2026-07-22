"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  MessagesSquare,
  MessageSquareText,
  Megaphone,
  Send,
  Users,
  KanbanSquare,
  Sparkles,
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ReactNode };

function buildNav(basePath: string): NavItem[] {
  return [
    {
      href: basePath,
      label: "Visão geral",
      icon: <LayoutDashboard className="size-[18px]" />,
    },
    {
      href: `${basePath}/conversas`,
      label: "Conversas",
      icon: <MessagesSquare className="size-[18px]" />,
    },
    {
      href: `${basePath}/leads`,
      label: "Leads",
      icon: <Users className="size-[18px]" />,
    },
    {
      href: `${basePath}/templates`,
      label: "Mensagens",
      icon: <MessageSquareText className="size-[18px]" />,
    },
    {
      href: `${basePath}/campaigns`,
      label: "Campanhas",
      icon: <Megaphone className="size-[18px]" />,
    },
    {
      href: `${basePath}/disparos`,
      label: "Disparos",
      icon: <Send className="size-[18px]" />,
    },
    {
      href: `${basePath}/pipeline`,
      label: "Pipeline",
      icon: <KanbanSquare className="size-[18px]" />,
    },
  ];
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string, base: string) => {
    if (href === base) return pathname === base;
    return pathname === href || pathname.startsWith(href + "/");
  };
}

function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-8" : "size-9";
  const icon = size === "sm" ? "size-4" : "size-[18px]";
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]",
        dim,
      )}
    >
      <Sparkles className={icon} />
    </div>
  );
}

function NavList({
  basePath,
  collapsed,
  onNavigate,
}: {
  basePath: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const nav = buildNav(basePath);
  const isActive = useIsActive();
  const base = basePath;
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active = isActive(item.href, base);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group relative flex items-center rounded-lg text-sm font-medium transition-all duration-200",
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
              active
                ? "ring-brand-active bg-gradient-to-r from-secondary/15 to-accent-2/10 text-fg ring-1 ring-inset ring-secondary/25"
                : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <span
              className={cn(
                "transition-colors",
                active
                  ? "text-secondary"
                  : "text-muted-2 group-hover:text-fg",
              )}
            >
              {item.icon}
            </span>
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  basePath,
  orgPath,
  name,
  persona,
  children,
}: {
  /** Prefixo de rota do agente: /org/<empresa>/<agente>. */
  basePath: string;
  /** Rota da empresa: /org/<empresa>. Volta para a lista de agentes. */
  orgPath: string;
  name: string;
  persona: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCollapsed(window.localStorage.getItem("sidebar-collapsed") === "1");
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div
      className="min-h-dvh"
      style={{ ["--sbw" as string]: collapsed ? "5rem" : "16rem" }}
    >
      {/* ---- Desktop sidebar ---- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sbw)] flex-col border-r border-border glass px-3 py-4 transition-[width] duration-300 lg:flex">
        <Link
          href={orgPath}
          title="Todos os agentes"
          className={cn(
            "mb-4 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-2 transition-colors hover:text-fg",
            collapsed && "justify-center px-0",
          )}
        >
          <ChevronLeft className="size-3.5" />
          {!collapsed ? "Todos os agentes" : null}
        </Link>

        <div
          className={cn(
            "mb-5 flex items-center gap-3 px-1",
            collapsed && "justify-center px-0",
          )}
        >
          <BrandMark />
          {!collapsed ? (
            <div className="min-w-0">
              <div className="truncate font-semibold leading-tight">{name}</div>
              <div className="truncate text-xs text-muted">Persona {persona}</div>
            </div>
          ) : null}
        </div>

        <NavList basePath={basePath} collapsed={collapsed} />

        <div className="mt-auto flex flex-col gap-3">
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Expandir" : "Recolher"}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-2 transition-colors hover:bg-surface-2 hover:text-fg",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                Recolher
              </>
            )}
          </button>
          {!collapsed ? (
            <div className="px-2 text-[11px] text-muted-2">
              Central de Agentes IA
            </div>
          ) : null}
        </div>
      </aside>

      {/* ---- Mobile topbar ---- */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border glass px-4 lg:hidden">
        <div className="flex items-center gap-2.5">
          <BrandMark size="sm" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{name}</div>
            <div className="text-[11px] text-muted">Persona {persona}</div>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="grid size-9 place-items-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-fg"
        >
          <Menu className="size-4" />
        </button>
      </header>

      {/* ---- Mobile drawer ---- */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col border-r border-border bg-surface px-3 py-4 shadow-2xl animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BrandMark size="sm" />
                <div className="leading-tight">
                  <div className="text-sm font-semibold">{name}</div>
                  <div className="text-[11px] text-muted">Persona {persona}</div>
                </div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="grid size-8 place-items-center rounded-lg text-muted-2 hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
            <NavList
              basePath={basePath}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
            <Link
              href={orgPath}
              onClick={() => setMobileOpen(false)}
              className="mt-auto flex items-center gap-1.5 px-2 py-1 text-xs text-muted-2 hover:text-fg"
            >
              <ChevronLeft className="size-3.5" /> Todos os agentes
            </Link>
          </div>
        </div>
      ) : null}

      {/* ---- Main ---- */}
      <main className="pt-14 transition-[padding] duration-300 lg:pt-0 lg:pl-[var(--sbw)]">
        {children}
      </main>
    </div>
  );
}
