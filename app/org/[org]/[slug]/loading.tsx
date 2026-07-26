import { Skeleton } from "@/components/ui";

/**
 * Feedback INSTANTÂNEO de navegação. Sem este arquivo, o App Router segura a
 * tela na página anterior enquanto o servidor renderiza a próxima (auth +
 * queries), o que dá a sensação de "cliquei e não foi". Com ele, ao clicar
 * num item da sidebar a área de conteúdo troca na hora por este esqueleto e a
 * página real entra assim que os dados chegam. A sidebar (no layout) fica
 * intacta, só o conteúdo mostra o esqueleto.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      {/* Cabeçalho */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {/* Faixa de cartões (KPIs / resumo) */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-surface-2/50 p-4"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-4 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Bloco principal (lista / tabela / painel) */}
      <div className="mt-6 rounded-xl border border-border bg-surface-2/50 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-3 w-14 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
