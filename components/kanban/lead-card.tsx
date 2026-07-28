"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Avatar, AvatarFallback } from "@/components/shadcn/avatar";
import { Lead } from "@/server/db/schema";
import { cn } from "@/lib/utils";
import { Calendar, GripVertical, Pencil, Search } from "lucide-react";
import { memo, useState, type CSSProperties } from "react";
import { EditLeadDialog } from "./edit-lead-dialog";
import { Button } from "@/components/shadcn/button";
import { getWhatsAppLink } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/shadcn/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { updateLeadContent } from "@/server/actions/leads";
import { useRouter } from "next/navigation";
import { getLeadSource } from "@/lib/leads-helper";

// ============================================================
// SOURCE ICONS (SVG inline para não depender de pacotes externos)
// ============================================================
function GoogleAdsIcon({ className }: { className?: string }) {
  // Logo oficial do Google Ads (Simple Icons v14)
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path fill="#FBBC04" d="M7.5137 4.8438L1.5645 15.1484A4.5 4.5 0 0 1 4 14.4297c2.5597-.0075 4.6248 2.1585 4.4941 4.7148l3.2168-5.5723-3.6094-6.25c-.4499-.7793-.6322-1.6394-.5878-2.4784z"/>
      <path fill="#4285F4" d="M23.4641 16.9287L15.4632 3.072C14.3586 1.1587 11.9121.5028 9.9988 1.6074S7.4295 5.1585 8.5341 7.0718l8.0009 13.8567c1.1046 1.9133 3.5511 2.5679 5.4644 1.4646 1.9134-1.1046 2.568-3.5511 1.4647-5.4644z"/>
      <circle fill="#34A853" cx="3.9998" cy="18.9293" r="3.9998"/>
    </svg>
  );
}

function MetaIcon({ className }: { className?: string }) {
  // Logo oficial da Meta (Simple Icons v14) — infinito azul
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path fill="#0081FB" d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"/>
    </svg>
  );
}

// ============================================================
// AI SOURCE ICONS
// ============================================================
function ChatGPTIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
    </svg>
  );
}

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M4.709 15.955l4.71-11.91h2.828L7.537 15.955H4.709zm7.063 0L16.482 4.045h2.828L14.6 15.955h-2.828z"/>
    </svg>
  );
}

function GeminiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gemini-g" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4"/>
          <stop offset="1" stopColor="#886FBF"/>
        </linearGradient>
      </defs>
      <path fill="url(#gemini-g)" d="M12 0C12 6.627 17.373 12 24 12c-6.627 0-12 5.373-12 12 0-6.627-5.373-12-12-12 6.627 0 12-5.373 12-12z"/>
    </svg>
  );
}

function GrokIcon({ className }: { className?: string }) {
  // Logo estilizado do Grok / X.AI
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

function AISearchIcon({ className }: { className?: string }) {
  // Ícone genérico para outras IAs (sparkle + search)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <circle cx="17" cy="17" r="3"/>
      <path d="M20.5 20.5L22 22"/>
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.274-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.065-.301-.15-1.265-.462-2.406-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.095-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.197 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.21 2.095 3.2 5.077 4.485.709.305 1.262.485 1.694.62.713.225 1.362.195 1.874.115.576-.09 1.767-.721 2.016-1.426.248-.705.248-1.305.174-1.425-.074-.121-.274-.196-.574-.346z"/>
      <path d="M12.001 2C6.478 2 2 6.478 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.932-1.41A9.953 9.953 0 0012.001 22C17.523 22 22 17.522 22 12S17.523 2 12.001 2zm0 18.15c-1.726 0-3.375-.472-4.816-1.358l-.345-.206-3.578.938.955-3.487-.224-.357A8.097 8.097 0 013.85 12c0-4.498 3.652-8.15 8.15-8.15S20.15 7.502 20.15 12s-3.652 8.15-8.149 8.15z"/>
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
}

function CaptacaoIcon({ className }: { className?: string }) {
  return <Search className={className} />;
}

function OrganicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 20h10"/>
      <path d="M10 20c5.5-2.5.8-6.4 3-10"/>
      <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/>
      <path d="M14.1 6a7 7 0 00-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>
    </svg>
  );
}

// ============================================================
// SOURCE CONFIG (centralizado)
// ============================================================
const SOURCE_CONFIG: Record<string, {
  icon: React.FC<{ className?: string }>;
  badgeClass: string;
  popoverClass: string;
  label: string;
}> = {
  Google: {
    icon: GoogleAdsIcon,
    badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]",
    popoverClass: "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/30 dark:text-rose-300",
    label: "Google Ads",
  },
  Meta: {
    icon: MetaIcon,
    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-500/30 shadow-[0_0_10px_rgba(14,165,233,0.2)]",
    popoverClass: "bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/30 dark:text-sky-300",
    label: "Meta Ads",
  },
  WhatsApp: {
    icon: WhatsAppIcon,
    badgeClass: "bg-green-500/20 text-green-300 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]",
    popoverClass: "bg-green-50 text-green-700 border-green-100 dark:bg-green-900/30 dark:text-green-300",
    label: "WhatsApp",
  },
  Direct: {
    icon: InstagramIcon,
    badgeClass: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30 shadow-[0_0_10px_rgba(217,70,239,0.2)]",
    popoverClass: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
    label: "Direct",
  },
  ChatGPT: {
    icon: ChatGPTIcon,
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]",
    popoverClass: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300",
    label: "ChatGPT",
  },
  Claude: {
    icon: ClaudeIcon,
    badgeClass: "bg-orange-500/20 text-orange-300 border-orange-500/30 shadow-[0_0_10px_rgba(249,115,22,0.2)]",
    popoverClass: "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/30 dark:text-orange-300",
    label: "Claude",
  },
  Gemini: {
    icon: GeminiIcon,
    badgeClass: "bg-blue-500/20 text-blue-300 border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.2)]",
    popoverClass: "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30 dark:text-blue-300",
    label: "Gemini",
  },
  Grok: {
    icon: GrokIcon,
    badgeClass: "bg-neutral-500/20 text-neutral-300 border-neutral-500/30 shadow-[0_0_10px_rgba(163,163,163,0.2)]",
    popoverClass: "bg-neutral-50 text-neutral-700 border-neutral-100 dark:bg-neutral-900/30 dark:text-neutral-300",
    label: "Grok",
  },
  "AI Search": {
    icon: AISearchIcon,
    badgeClass: "bg-violet-500/20 text-violet-300 border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.2)]",
    popoverClass: "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-900/30 dark:text-violet-300",
    label: "AI Search",
  },
  "Captação Ativa": {
    icon: CaptacaoIcon,
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]",
    popoverClass: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/30 dark:text-amber-300",
    label: "Captação Ativa",
  },
  "Orgânicos": {
    icon: OrganicIcon,
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]",
    popoverClass: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300",
    label: "Orgânicos",
  },
};

const ORIGIN_KEYS = Object.keys(SOURCE_CONFIG);

const DEFAULT_SOURCE_CONFIG = {
  icon: ({ className }: { className?: string }) => <Search className={className} />,
  badgeClass: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.2)]",
  popoverClass: "bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300",
  label: "Outro",
};

export const LeadCard = memo(function LeadCard({ lead, columnId }: { lead: Lead; columnId: string }) {
  const {
    setNodeRef,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lead.id,
    data: { type: "lead", columnId },
    // Não anima o reflow quando a lista muda (ex: filtro da busca), o que causava
    // cards "fantasma" deslizando sozinhos enquanto o usuário digita.
    animateLayoutChanges: () => false,
  });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    WebkitTouchCallout: "none",
  };

  // Sem {...attributes} de proposito: evita tabIndex/role=button que tornavam o card
  // focavel e faziam a barra de espaco pega-lo. Arraste vem so dos listeners (mouse/touch).
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      className={cn(
        "mb-3 select-none touch-manipulation cursor-grab active:cursor-grabbing outline-none",
        isDragging && "opacity-40"
      )}
    >
      <LeadCardVisual lead={lead} />
    </div>
  );
});

// Renderizado dentro do DragOverlay enquanto arrasta (segue o dedo/ponteiro).
export function LeadCardPresentation({ lead }: { lead: Lead }) {
  return (
    <div className="mb-3">
      <LeadCardVisual lead={lead} dragging interactive={false} />
    </div>
  );
}

interface LeadCardVisualProps {
  lead: Lead;
  dragging?: boolean;
  interactive?: boolean;
}

// memo: durante o arraste o wrapper re-renderiza a cada frame (contexto do dnd-kit),
// mas a árvore pesada (tooltips, popover, SVGs) só reconcilia se o lead mudar.
const LeadCardVisual = memo(function LeadCardVisual({ lead, dragging = false, interactive = true }: LeadCardVisualProps) {
  const router = useRouter();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [originPopoverOpen, setOriginPopoverOpen] = useState(false);
  const [isUpdatingOrigin, setIsUpdatingOrigin] = useState(false);

  const handleOriginChange = async (newOrigin: string) => {
    setIsUpdatingOrigin(true);
    try {
      await updateLeadContent(lead.id, { campaignSource: newOrigin }, lead.organizationId);
      router.refresh();
    } finally {
      setIsUpdatingOrigin(false);
      setOriginPopoverOpen(false);
    }
  };

  const source = getLeadSource(lead);
  const sourceConf = SOURCE_CONFIG[source] || DEFAULT_SOURCE_CONFIG;
  const SourceIcon = sourceConf.icon;

  return (
    <>
      <div className={cn(
        "w-full h-full",
        !dragging && "transition-transform duration-300",
        dragging && "rotate-2 scale-[1.03] drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
      )}>
        <Card
          className={cn(
            "relative overflow-hidden transition-all duration-300",
            "glass-card hover:glass-panel hover:shadow-2xl hover:-translate-y-1.5",
            dragging && "shadow-2xl ring-2 ring-indigo-500/50 bg-white dark:bg-slate-900 !opacity-100 border-indigo-400/50 shadow-indigo-500/40 !transition-none"
          )}
          onClick={() => {
            if (interactive) setShowEditDialog(true);
          }}
        >
          {/* Subtle inner glow for dark mode, subtle shadow for light mode */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 dark:from-white/5 to-transparent pointer-events-none opacity-50" />

          <CardContent className="p-4 space-y-3 relative z-10">
            {/* Header with Tags */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Dica visual de que o card inteiro é arrastável (segurar e mover) */}
                <span className="-ml-1 p-1 text-slate-300 dark:text-white/20 shrink-0 pointer-events-none">
                  <GripVertical className="h-4 w-4" />
                </span>
                <Popover open={originPopoverOpen} onOpenChange={setOriginPopoverOpen}>
                  <PopoverTrigger asChild>
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); if (interactive) setOriginPopoverOpen(true); }}
                    >
                      {source ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "px-2 py-1 border transition-all duration-300 cursor-pointer hover:scale-110",
                                  sourceConf.badgeClass
                                )}
                              >
                                <SourceIcon className="h-3.5 w-3.5" />
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 font-bold text-xs uppercase tracking-widest px-3 py-2 text-slate-900 dark:text-white">
                              {sourceConf.label || source}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Badge
                          variant="outline"
                          className="px-2 py-0.5 text-[11px] font-bold border-dashed border-slate-300 dark:border-white/20 text-slate-400 dark:text-white/40 cursor-pointer hover:border-indigo-400/50 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
                        >
                          + Origem
                        </Badge>
                      )}
                    </div>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-48 p-2 bg-white dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-xl z-[100000] rounded-2xl"
                    align="start"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="space-y-1.5">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-white/40 mb-2 px-1">Origem do Lead</p>
                      {ORIGIN_KEYS.map((key) => {
                        const conf = SOURCE_CONFIG[key];
                        const Icon = conf.icon;
                        return (
                          <button
                            key={key}
                            onClick={() => handleOriginChange(key)}
                            disabled={isUpdatingOrigin}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-2.5",
                              "hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent",
                              lead.campaignSource === key
                                ? "bg-slate-100 dark:bg-white/15 border-slate-200 dark:border-white/20 text-slate-900 dark:text-white shadow-sm"
                                : "text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white"
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {conf.label}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>

                {lead.followUpDate && (() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const followUp = new Date(lead.followUpDate);
                  const followUpDateLocal = new Date(followUp.getUTCFullYear(), followUp.getUTCMonth(), followUp.getUTCDate(), 0, 0, 0, 0);
                  const isOverdue = followUpDateLocal < today;
                  const isToday = followUpDateLocal.getTime() === today.getTime();

                  return (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "px-2 py-0.5 text-[11px] font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all",
                        isOverdue && "bg-red-500/10 text-red-500 border-red-500/20",
                        isToday && "bg-amber-500/10 text-amber-500 border-amber-500/20",
                        !isOverdue && !isToday && "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      )}
                    >
                      <span className={cn(
                        "h-1 w-1 rounded-full",
                        isOverdue && "bg-red-500 animate-pulse",
                        isToday && "bg-amber-500 animate-pulse",
                        !isOverdue && !isToday && "bg-blue-500"
                      )} />
                      {followUpDateLocal.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </Badge>
                  );
                })()}
              </div>

              <div className="flex items-center gap-1 transition-opacity duration-300">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!lead.whatsapp}
                        className={cn(
                          "h-7 w-7 rounded-xl transition-all duration-300",
                          lead.whatsapp
                            ? "text-emerald-500 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-emerald-500/20 hover:scale-110"
                            : "text-slate-200 dark:text-white/10 cursor-not-allowed"
                        )}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (lead.whatsapp) {
                            window.open(getWhatsAppLink(lead.whatsapp), '_blank');
                          }
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.274-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.065-.301-.15-1.265-.462-2.406-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.095-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.197 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.21 2.095 3.2 5.077 4.485.709.305 1.262.485 1.694.62.713.225 1.362.195 1.874.115.576-.09 1.767-.721 2.016-1.426.248-.705.248-1.305.174-1.425-.074-.121-.274-.196-.574-.346z" />
                          <path d="M12.001 22.45h-.006c-1.844 0-3.654-.489-5.24-1.414l-.375-.224-3.899 1.021 1.04-3.799-.247-.393a10.428 10.428 0 01-1.597-5.592c0-5.766 4.704-10.457 10.485-10.457 2.793 0 5.419 1.088 7.391 3.065A10.422 10.422 0 0122.484 12c0 5.766-4.704 10.456-10.483 10.45l-.001.002zM6.92 18.23l.317.189c1.45.861 3.128 1.317 4.881 1.319 4.269 0 7.747-3.473 7.747-7.739a7.712 7.712 0 00-2.268-5.464 7.72 7.72 0 00-5.474-2.274C7.854 4.261 4.376 7.734 4.376 12A7.72 7.72 0 005.8 16.518l.206.328-.616 2.251 2.306-.604-.776-.263z" />
                        </svg>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 font-bold text-xs uppercase tracking-widest px-3 py-2 text-slate-900 dark:text-white">
                      {lead.whatsapp ? "WhatsApp" : "Sem WhatsApp"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-xl text-slate-400 dark:text-white/30 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/20 transition-all duration-300 hover:scale-110"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowEditDialog(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-start gap-2">
                <h4 className="text-sm font-black text-slate-900 dark:text-white tracking-tight leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors duration-300">
                  {lead.name}
                </h4>
                {lead.value && (
                  <div className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 shadow-sm shrink-0">
                    R$ {lead.value}
                  </div>
                )}
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                {lead.company}
              </p>
              <p className="text-xs text-slate-600 dark:text-white/50 line-clamp-2 min-h-[2.5em] leading-relaxed group-hover:text-slate-800 dark:group-hover:text-white/70 transition-colors duration-300">
                {lead.notes || "Sem observações adicionais..."}
              </p>
            </div>

            {/* Footer Info */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/5">
              {/* Lead Initials Avatar (Placeholder for Assignee) */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Avatar className="h-6 w-6 border border-white/20 shadow-sm">
                    <AvatarFallback className="text-[10px] bg-indigo-500 text-white font-black">
                      {lead.name?.substring(0, 2).toUpperCase() || "UN"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-emerald-500 shadow-sm" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/5">
                  Lead
                </span>
              </div>

              {/* Meta Stats */}
              <div className="flex items-center gap-3 text-slate-400 dark:text-white/30">
                <div className="flex items-center gap-1.5 text-[11px] font-bold">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {(() => {
                      try {
                        return lead?.createdAt
                          ? new Date(lead.createdAt).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })
                          : "-";
                      } catch {
                        return "-";
                      }
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {interactive && (
        <EditLeadDialog lead={lead} open={showEditDialog} onOpenChange={setShowEditDialog} orgId={lead.organizationId} />
      )}
    </>
  );
});
