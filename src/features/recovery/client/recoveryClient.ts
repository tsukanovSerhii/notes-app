import { deriveRecovery, openSyncKey, sealSyncKey } from "@/features/recovery/client/recoveryCrypto";
import {
  RECOVERY_CODE_BYTES,
  formatRecoveryCode,
  parseRecoveryCode,
} from "@/features/recovery/shared/recovery";

export class RecoveryError extends Error {
  constructor(
    readonly code: "notFound" | "busy" | "disabled" | "failed",
    message: string
  ) {
    super(message);
  }
}

const refusal = (status: number) =>
  status === 404
    ? new RecoveryError("notFound", "Nothing is stored for that code.")
    : status === 429
      ? new RecoveryError("busy", "Too many attempts. Try again shortly.")
      : status === 503
        ? new RecoveryError("disabled", "Recovery is turned off on this server.")
        : new RecoveryError("failed", `The server refused the request (${status}).`);

/** A new recovery code: 160 random bits, shown once. */
export function newRecoveryCode(): { code: string; secret: Uint8Array } {
  const secret = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES));
  return { code: formatRecoveryCode(secret), secret };
}

/** The secret behind a typed recovery code, or null if it is not a whole code. */
export const secretFromCode = parseRecoveryCode;

/** Seals the sync key with the secret and stores it on the server. Returns the lookup id. */
export async function storeRecovery(secret: Uint8Array, syncKey: string, fetchFn: typeof fetch): Promise<string> {
  const recovery = await deriveRecovery(secret);
  const res = await fetchFn(`/api/recovery/${recovery.lookupId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blob: await sealSyncKey(recovery, syncKey) }),
  });
  if (!res.ok) throw refusal(res.status);
  return recovery.lookupId;
}

/** The sync key stored for this secret. Throws `notFound` if there is none or the secret is wrong. */
export async function recoverSyncKey(secret: Uint8Array, fetchFn: typeof fetch): Promise<string> {
  const recovery = await deriveRecovery(secret);
  const res = await fetchFn(`/api/recovery/${recovery.lookupId}`, { cache: "no-store" });
  if (!res.ok) throw refusal(res.status);
  const { blob } = (await res.json()) as { blob: string };
  try {
    return await openSyncKey(recovery, blob);
  } catch {
    throw new RecoveryError("notFound", "That secret does not open the stored key.");
  }
}

export async function removeRecovery(lookupId: string, fetchFn: typeof fetch): Promise<void> {
  const res = await fetchFn(`/api/recovery/${lookupId}`, { method: "DELETE" });
  if (!res.ok) throw refusal(res.status);
}

/** What this device knows about the ways set up to get the key back (the secrets themselves are never kept). */
export interface RecoveryState {
  code: { lookupId: string; createdAt: number } | null;
  passkey: { lookupId: string; credentialId: string; createdAt: number } | null;
}

export const RECOVERY_STORAGE = "notevoid-recovery";

export function createRecoveryState(storage: Pick<Storage, "getItem" | "setItem"> | null) {
  const empty: RecoveryState = { code: null, passkey: null };
  const read = (): RecoveryState => {
    try {
      const v = JSON.parse(storage?.getItem(RECOVERY_STORAGE) ?? "null") as Partial<RecoveryState> | null;
      return {
        code: v?.code && typeof v.code.lookupId === "string" ? v.code : null,
        passkey: v?.passkey && typeof v.passkey.lookupId === "string" && typeof v.passkey.credentialId === "string" ? v.passkey : null,
      };
    } catch {
      return empty;
    }
  };
  return {
    get: read,
    set(next: RecoveryState) {
      try {
        storage?.setItem(RECOVERY_STORAGE, JSON.stringify(next));
      } catch {
        // Without storage the setup still works; this device just forgets it did it.
      }
    },
  };
}
