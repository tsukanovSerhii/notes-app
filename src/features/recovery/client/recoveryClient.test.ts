import { expect, test } from "@playwright/test";
import {
  RecoveryError,
  createRecoveryState,
  newRecoveryCode,
  recoverSyncKey,
  removeRecovery,
  secretFromCode,
  storeRecovery,
} from "@/features/recovery/client/recoveryClient";
import { deriveRecovery, openSyncKey, sealSyncKey } from "@/features/recovery/client/recoveryCrypto";
import {
  PasskeyError,
  createPasskeySecret,
  getPasskeySecret,
  type CredentialsApi,
} from "@/features/recovery/client/passkey";
import { deleteRecovery, getRecovery, putRecovery } from "@/features/recovery/server/recoveryHandler";
import { createMemoryRecoveryRepository } from "@/features/recovery/server/recoveryRepositories";

const SYNC_KEY = "k".repeat(32);

function server() {
  const repo = createMemoryRecoveryRepository();
  const deps = { repo };
  const fetchFn: typeof fetch = async (input, init) => {
    const id = String(input).split("/").pop()!;
    const method = init?.method ?? "GET";
    const out =
      method === "PUT"
        ? await putRecovery(deps, "ip", id, JSON.parse(String(init?.body)))
        : method === "DELETE"
          ? await deleteRecovery(deps, "ip", id)
          : await getRecovery(deps, "ip", id);
    return new Response(JSON.stringify(out.json), { status: out.status });
  };
  return { repo, fetchFn };
}

test("one secret gives the same id and key every time; different secrets give different ones", async () => {
  const secret = crypto.getRandomValues(new Uint8Array(20));
  const a = await deriveRecovery(secret);
  const b = await deriveRecovery(secret);
  const c = await deriveRecovery(crypto.getRandomValues(new Uint8Array(20)));
  expect(a.lookupId).toMatch(/^[a-f0-9]{64}$/);
  expect(a.lookupId).toBe(b.lookupId);
  expect(c.lookupId).not.toBe(a.lookupId);
  // What one device seals, another with the same secret opens.
  expect(await openSyncKey(b, await sealSyncKey(a, SYNC_KEY))).toBe(SYNC_KEY);
  await expect(openSyncKey(c, await sealSyncKey(a, SYNC_KEY))).rejects.toBeTruthy();
});

test("a blob opens only under its own id", async () => {
  const secret = crypto.getRandomValues(new Uint8Array(20));
  const a = await deriveRecovery(secret);
  const blob = await sealSyncKey(a, SYNC_KEY);
  // Same wrapping key, but the blob is bound to the id it was stored under.
  await expect(openSyncKey({ ...a, lookupId: "0".repeat(64) }, blob)).rejects.toBeTruthy();
});

test("the sync key is stored sealed, and a recovery code brings it back", async () => {
  const { repo, fetchFn } = server();
  const { code, secret } = newRecoveryCode();
  const id = await storeRecovery(secret, SYNC_KEY, fetchFn);
  const stored = [...repo.blobs.values()].join("");
  expect(stored).not.toContain(SYNC_KEY);
  expect(repo.blobs.has(id)).toBe(true);
  expect(id).not.toContain(code.replace(/-/g, "").toLowerCase());

  const typed = secretFromCode(code.toLowerCase())!;
  expect(await recoverSyncKey(typed, fetchFn)).toBe(SYNC_KEY);
});

test("a wrong or unknown code finds nothing", async () => {
  const { fetchFn } = server();
  await storeRecovery(newRecoveryCode().secret, SYNC_KEY, fetchFn);
  const wrong = await recoverSyncKey(newRecoveryCode().secret, fetchFn).catch((e: RecoveryError) => e);
  expect(wrong).toBeInstanceOf(RecoveryError);
  expect((wrong as RecoveryError).code).toBe("notFound");
  expect(secretFromCode("ABCD-EFGH")).toBeNull();
});

test("a tampered blob does not open", async () => {
  const { repo, fetchFn } = server();
  const { secret } = newRecoveryCode();
  const id = await storeRecovery(secret, SYNC_KEY, fetchFn);
  const blob = repo.blobs.get(id)!;
  repo.blobs.set(id, blob.slice(0, 20) + (blob[20] === "A" ? "B" : "A") + blob.slice(21));
  await expect(recoverSyncKey(secret, fetchFn)).rejects.toMatchObject({ code: "notFound" });
});

test("replacing and removing", async () => {
  const { repo, fetchFn } = server();
  const { secret } = newRecoveryCode();
  const id = await storeRecovery(secret, SYNC_KEY, fetchFn);
  await storeRecovery(secret, "n".repeat(32), fetchFn);
  expect(await recoverSyncKey(secret, fetchFn)).toBe("n".repeat(32));
  await removeRecovery(id, fetchFn);
  expect(repo.blobs.size).toBe(0);
});

test("server refusals become typed errors", async () => {
  const refuse = (status: number): typeof fetch => async () => new Response("{}", { status });
  const code = (status: number) =>
    recoverSyncKey(newRecoveryCode().secret, refuse(status)).catch((e: RecoveryError) => e.code);
  expect(await code(429)).toBe("busy");
  expect(await code(503)).toBe("disabled");
  expect(await code(500)).toBe("failed");
});

/** An authenticator that derives a fixed secret per credential, like the PRF extension does. */
function fakeAuthenticator(options: { prf?: boolean } = {}): CredentialsApi & { created: number } {
  const credentialId = crypto.getRandomValues(new Uint8Array(16));
  const derive = async () => {
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array([...credentialId, 1, 2, 3]));
    return digest;
  };
  const credential = (withSecret: boolean, secret?: ArrayBuffer) =>
    ({
      rawId: credentialId.buffer,
      getClientExtensionResults: () => ({
        prf: { enabled: options.prf !== false, ...(withSecret && secret && { results: { first: secret } }) },
      }),
    }) as unknown as Credential;
  const api = {
    created: 0,
    async create() {
      api.created++;
      return credential(false);
    },
    async get() {
      return credential(options.prf !== false, await derive());
    },
  };
  return api;
}

test("a passkey gives the same secret when it signs in again, so the stored key can be recovered", async () => {
  const { fetchFn } = server();
  const authenticator = fakeAuthenticator();
  const made = await createPasskeySecret(authenticator, "notes.example");
  expect(made.secret).toHaveLength(32);
  await storeRecovery(made.secret, SYNC_KEY, fetchFn);

  // On another device the passkey is offered without knowing which one.
  const again = await getPasskeySecret(authenticator, "notes.example");
  expect(again.secret).toEqual(made.secret);
  expect(again.credentialId).toBe(made.credentialId);
  expect(await recoverSyncKey(again.secret, fetchFn)).toBe(SYNC_KEY);
});

test("an authenticator without the PRF extension is reported as unsupported", async () => {
  const error = await createPasskeySecret(fakeAuthenticator({ prf: false }), "notes.example").catch((e: PasskeyError) => e);
  expect(error).toBeInstanceOf(PasskeyError);
  expect((error as PasskeyError).code).toBe("unsupported");
});

test("cancelling the prompt is not an error to scold about", async () => {
  const cancelling: CredentialsApi = {
    create: async () => {
      throw Object.assign(new Error("x"), { name: "NotAllowedError" });
    },
    get: async () => null,
  };
  expect(await createPasskeySecret(cancelling, "h").catch((e: PasskeyError) => e.code)).toBe("cancelled");
  expect(await getPasskeySecret(cancelling, "h").catch((e: PasskeyError) => e.code)).toBe("cancelled");
});

test("this device remembers which ways are set up, not the secrets", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  const state = createRecoveryState(storage);
  expect(state.get()).toEqual({ code: null, passkey: null });
  state.set({ code: { lookupId: "a".repeat(64), createdAt: 1 }, passkey: null });
  expect(createRecoveryState(storage).get().code?.createdAt).toBe(1);
  map.set("notevoid-recovery", "garbage");
  expect(state.get()).toEqual({ code: null, passkey: null });
  expect(createRecoveryState(null).get()).toEqual({ code: null, passkey: null });
});
