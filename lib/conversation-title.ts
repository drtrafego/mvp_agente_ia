/**
 * O titulo da sessao descreve o assunto; o lead/contato identifica a pessoa.
 * Quando o CRM tem um nome real, ele deve ser o titulo visivel da conversa.
 */
export function resolveConversationTitle(
  contactName: string | null | undefined,
  storedTitle: string | null | undefined,
): string | null {
  const contact = clean(contactName);
  if (contact && !isPlaceholder(contact)) return contact;

  return clean(storedTitle);
}

function clean(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/\s+/g, " ") ?? "";
  return cleaned || null;
}

function isPlaceholder(value: string): boolean {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    new Set([
      "sem nome",
      "cliente",
      "contato",
      "lead",
      "conversa",
      "conversa sem titulo",
    ]).has(normalized)
  ) {
    return true;
  }

  // Telefone copiado para o campo de nome nao e nome real.
  return !/[a-z]/i.test(normalized);
}
