import { Bot, LockKeyhole } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from = "/", error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-primary/20 text-secondary ring-1 ring-primary/40">
            <Bot className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Central de Agentes</h1>
            <p className="text-sm text-muted">Painel de atendimento IA</p>
          </div>
        </div>

        <form
          action="/api/auth"
          method="POST"
          className="rounded-xl border border-border bg-surface p-6"
        >
          <input type="hidden" name="from" value={from} />
          <label className="mb-2 block text-sm font-medium text-muted">
            Senha de acesso
          </label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
            <input
              name="password"
              type="password"
              autoFocus
              required
              placeholder="••••••••"
              className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-secondary focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          {error ? (
            <p className="mt-3 text-sm text-[#f87171]">Senha incorreta. Tente de novo.</p>
          ) : null}
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-secondary/50"
          >
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
