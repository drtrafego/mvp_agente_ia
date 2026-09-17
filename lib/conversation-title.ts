/**
 * Escolhe o nome que a pessoa ve na lista e no cabecalho da conversa.
 *
 * O titulo salvo em `conversations` e gerado pelo motor e muitas vezes descreve
 * o assunto (por exemplo, "Recepcao consultorio") em vez de identificar quem
 * esta falando. O CRM/lead e a fonte certa para identidade. Mantemos o titulo
 * antigo somente quando nao existe um nome de contato utilizavel.
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
