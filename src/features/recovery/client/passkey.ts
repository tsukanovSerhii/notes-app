import { fromB64url, toB64url } from "@/shared/lib/base64url";

/**
 * A passkey as a source of a secret. WebAuthn's PRF extension makes the
 * authenticator compute a value that depends on the credential and a salt and
 * is the same on every device the passkey syncs to. That value is the secret
 * the recovery module turns into a lookup id and a wrapping key. The server
 * never takes part in the sign-in: it only stores the sealed sync key.
 */

export type PasskeyFailure = "unsupported" | "cancelled" | "failed";

export class PasskeyError extends Error {
  constructor(
    readonly code: PasskeyFailure,
    message: string
  ) {
    super(message);
  }
}

const SALT = new TextEncoder().encode("notevoid-passkey-prf-v1");

/** The part of `navigator.credentials` used here, so tests can stand in for it. */
export interface CredentialsApi {
  create(options: CredentialCreationOptions): Promise<Credential | null>;
  get(options: CredentialRequestOptions): Promise<Credential | null>;
}

interface PrfResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}

const prfOf = (credential: Credential | null): { id: Uint8Array; secret?: Uint8Array; enabled: boolean } => {
  const c = credential as PublicKeyCredential | null;
  if (!c) throw new PasskeyError("cancelled", "No passkey was chosen.");
  const ext = c.getClientExtensionResults() as PrfResults;
  const first = ext.prf?.results?.first;
  return { id: new Uint8Array(c.rawId), secret: first ? new Uint8Array(first) : undefined, enabled: ext.prf?.enabled === true || !!first };
};

const wrap = (error: unknown): never => {
  if (error instanceof PasskeyError) throw error;
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") throw new PasskeyError("cancelled", "The passkey prompt was cancelled.");
  if (name === "NotSupportedError" || name === "SecurityError") {
    throw new PasskeyError("unsupported", "This browser or device cannot use a passkey this way.");
  }
  throw new PasskeyError("failed", "The passkey could not be used.");
};

export const passkeysAvailable = () => typeof window !== "undefined" && "PublicKeyCredential" in window;

/**
 * Creates a passkey and returns the secret it derives, with the credential's
 * id. Throws `unsupported` when the authenticator has no PRF extension.
 */
export async function createPasskeySecret(
  credentials: CredentialsApi,
  rpId: string
): Promise<{ secret: Uint8Array; credentialId: string }> {
  try {
    const created = await credentials.create({
      publicKey: {
        rp: { id: rpId, name: "NoteVoid" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "NoteVoid sync key", displayName: "NoteVoid" },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
        extensions: { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs,
      },
    });
    const made = prfOf(created);
    if (!made.enabled) throw new PasskeyError("unsupported", "This passkey cannot derive a secret on this device.");
    // Some browsers only hand out the value on sign-in, not on creation.
    const secret = made.secret ?? (await getPasskeySecret(credentials, rpId, toB64url(made.id))).secret;
    return { secret, credentialId: toB64url(made.id) };
  } catch (error) {
    return wrap(error);
  }
}

/**
 * Signs in with a passkey and returns the secret it derives. With a
 * `credentialId` only that passkey is offered; without, the user picks one of
 * the passkeys this site has on the device or in their account.
 */
export async function getPasskeySecret(
  credentials: CredentialsApi,
  rpId: string,
  credentialId?: string
): Promise<{ secret: Uint8Array; credentialId: string }> {
  try {
    const got = await credentials.get({
      publicKey: {
        rpId,
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        userVerification: "preferred",
        ...(credentialId && {
          allowCredentials: [{ type: "public-key" as const, id: fromB64url(credentialId) as BufferSource }],
        }),
        extensions: { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs,
      },
    });
    const result = prfOf(got);
    if (!result.secret) throw new PasskeyError("unsupported", "This passkey cannot derive a secret on this device.");
    return { secret: result.secret, credentialId: toB64url(result.id) };
  } catch (error) {
    return wrap(error);
  }
}

/** Convenience for the browser: the real credentials API and this site's id. */
export function browserPasskeys(): { credentials: CredentialsApi; rpId: string } {
  return { credentials: navigator.credentials as CredentialsApi, rpId: window.location.hostname };
}

