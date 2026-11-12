/**
 * Getting the sync key back without the key itself.
 *
 * A secret the user holds (a recovery code, or what a passkey derives) is run
 * through HKDF into two independent values: a lookup id and a wrapping key.
 * The sync key, sealed with the wrapping key, is stored on the server under
 * the lookup id. On a new device the same secret yields the same id and key,
 * so the sealed key can be fetched and opened; the server sees neither the
 * secret nor the sync key, and cannot tell what the blob is.
 */

/** The lookup id: 32 bytes as hex, derived from the secret. */
export const RECOVERY_ID = /^[a-f0-9]{64}$/;
/** A sealed sync key is a few dozen bytes; this leaves room and no more. */
export const MAX_RECOVERY_BLOB_LENGTH = 1024;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** A recovery code is 20 random bytes: 160 bits, 32 characters. */
export const RECOVERY_CODE_BYTES = 20;

/** Bytes as base32 in groups of four: `ABCD-EFGH-...`. */
export function formatRecoveryCode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join("-");
}

/** The bytes in a typed recovery code; ignores case, dashes and spaces. Null if it is not a whole code. */
export function parseRecoveryCode(text: string): Uint8Array | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, "");
  if (clean.length !== Math.ceil((RECOVERY_CODE_BYTES * 8) / 5)) return null;
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return out.length === RECOVERY_CODE_BYTES ? Uint8Array.from(out) : null;
}
