import { Home } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Saída para o portal do cliente.
 *
 * target _top é obrigatório: quando este painel roda dentro do iframe do
 * portal, um link comum navegaria apenas o iframe e o usuário ficaria com o
 * portal por fora e o portal por dentro, sem conseguir sair. Com _top a
 * navegação acontece na janela inteira, e no acesso direto ao subdomínio o
 * comportamento é o de um link normal.
 */
export function PortalLink({
  collapsed = false,
  onNavigate,
  className,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const url =
    process.env.NEXT_PUBLIC_PORTAL_URL?.trim() ||
    "https://cliente.casaldotrafego.com/hub";

  return (
    <a
      href={url}
      target="_top"
      onClick={onNavigate}
      title="Voltar ao portal"
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-2 transition-colors hover:bg-surface-2 hover:text-fg",
        collapsed && "justify-center px-0",
        className,
      )}
    >
      <Home className="size-4 shrink-0" />
      {!collapsed ? "Voltar ao portal" : null}
    </a>
  );
}
