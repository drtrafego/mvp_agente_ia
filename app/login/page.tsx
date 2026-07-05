import { Sparkles, LockKeyhole } from "lucide-react";

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
          <div className="grid size-11 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
            <Sparkles className="size-6" />
          </div>
          <div>
            <h1 className="text-gradient inline-block text-lg font-semibold tracking-tight">
              Central de Agentes
            </h1>
            <p className="text-sm text-muted">Painel de atendimento IA</p>
          </div>
        </div>

        <form
          action="/api/auth"
          method="POST"
          className="rounded-2xl border border-border glass p-6 shadow-soft"
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
            className="brand-gradient mt-4 w-full rounded-lg py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-secondary/50"
          >
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
