import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Decifra segredos gravados pelo /admin do portal (token da Meta por agente).
 *
 * Formato armazenado: v1.<iv base64>.<authTag base64>.<ciphertext base64>
 * Algoritmo: aes-256-gcm. Chave: AGENTS_SECRET_KEY, 32 bytes em base64,
 * a MESMA nos dois projetos Vercel (o portal cifra, este app decifra).
 *
 * Nunca lança: sem chave, com formato desconhecido ou com authTag inválido,
 * devolve null e o chamador cai no fallback de env.
 */
/**
 * Cifra um segredo no MESMO formato que o /admin do portal grava, para a tela
 * de configurações do agente poder trocar o token da Meta por aqui.
 * Lança quando a chave não está configurada: gravar token em claro no banco
 * seria pior do que falhar.
 */
export function encryptSecret(plain: string): string {
  const rawKey = process.env.AGENTS_SECRET_KEY?.trim();
  if (!rawKey) throw new Error("AGENTS_SECRET_KEY não configurada.");

  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) {
    throw new Error("AGENTS_SECRET_KEY inválida: são esperados 32 bytes em base64.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    authTag.toString("base64"),
    payload.toString("base64"),
  ].join(".");
}

export function decryptSecret(cipher: string | null | undefined): string | null {
  if (!cipher) return null;

  const rawKey = process.env.AGENTS_SECRET_KEY?.trim();
  if (!rawKey) return null;

  const parts = cipher.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;

  try {
    const key = Buffer.from(rawKey, "base64");
    if (key.length !== 32) return null;

    const iv = Buffer.from(parts[1], "base64");
    const authTag = Buffer.from(parts[2], "base64");
    const payload = Buffer.from(parts[3], "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(payload), decipher.final()]);
    return plain.toString("utf8") || null;
  } catch {
    return null;
  }
}
