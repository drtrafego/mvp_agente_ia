/**
 * Superadmin por env, cópia do lib/admin.ts do portal para as duas listas
 * serem a mesma coisa. Emails vivem APENAS em ADMIN_EMAILS (lista separada por
 * vírgula) e SUPERADMIN_EMAIL. Sem env definida, ninguém é superadmin
 * (falha fechada). Sem log de email, para não vazar dado em log.
 */
function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;

  const list = unquote((process.env.ADMIN_EMAILS || "").trim())
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const superAdmin = unquote(
    (process.env.SUPERADMIN_EMAIL || "").trim(),
  ).toLowerCase();

  const normalized = email.trim().toLowerCase();
  return (
    list.includes(normalized) ||
    (superAdmin !== "" && normalized === superAdmin)
  );
}
