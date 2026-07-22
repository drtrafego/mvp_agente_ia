import "server-only";
import { createDecipheriv } from "node:crypto";

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
