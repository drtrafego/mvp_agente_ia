export function PageWrapper({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  // wide = ocupa a largura inteira da área de conteúdo (ex.: o quadro do CRM,
  // que precisa mostrar todas as colunas em telas grandes). Padrão: coluna
  // central de leitura (max-w-7xl), boa para dashboards e listas.
  wide?: boolean;
}) {
  return (
    <div
      className={[
        "animate-fade-up px-4 py-6 sm:px-6 sm:py-8",
        wide ? "w-full" : "mx-auto max-w-7xl",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
