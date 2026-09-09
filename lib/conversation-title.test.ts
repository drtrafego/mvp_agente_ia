import assert from "node:assert/strict";
import test from "node:test";
import { resolveConversationTitle } from "./conversation-title";

test("prioriza o nome real do contato sobre um titulo generico", () => {
  assert.equal(
    resolveConversationTitle("  Maria da Silva  ", "Recepcao consultorio"),
    "Maria da Silva",
  );
});

test("prioriza o nome real mesmo quando o titulo salvo parece valido", () => {
  assert.equal(
    resolveConversationTitle("Joao Souza", "Duvida sobre consulta"),
    "Joao Souza",
  );
});

test("nao troca um titulo util por placeholder do CRM", () => {
  assert.equal(
    resolveConversationTitle("Sem nome", "Pedido de agendamento"),
    "Pedido de agendamento",
  );
  assert.equal(
    resolveConversationTitle("5511999999999", "Paciente novo"),
    "Paciente novo",
  );
});

test("normaliza espacos e preserva null quando nao ha nenhum titulo", () => {
  assert.equal(resolveConversationTitle("Ana   Lima", null), "Ana Lima");
  assert.equal(resolveConversationTitle(" ", " "), null);
});
