/**
 * Descifrado de los datos personales de las cuentas del menú, en WebCrypto.
 *
 * Es el port de `openPii` del Portal (`saas-godcode-admin/lib/menu-account/pii.ts`,
 * Node crypto). Solo descifra: el panel nunca cifra datos de una cuenta. Corre en
 * Deno (Edge Function `client-pii`) y en vitest, porque no importa nada de Node.
 *
 * Formato: `enc:v1:` + base64url(iv 12 bytes | tag 16 bytes | texto cifrado).
 * Llave: HKDF-SHA256 sobre `MENU_ACCOUNT_PII_KEY` (32 bytes en base64), sal vacía,
 * info `menu-account-pii:aes-256-gcm:v1`. Los casos de `pii-contract-cases.ts` fijan
 * que ambos lados coincidan.
 */

const SEALED_PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENCRYPTION_INFO = "menu-account-pii:aes-256-gcm:v1";

export function isSealedPii(value: unknown): value is string {
	return typeof value === "string" && value.startsWith(SEALED_PREFIX);
}

function decodeBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function decodeBase64Url(value: string): Uint8Array {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
	return decodeBase64(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
}

export type PiiOpener = (value: string | null | undefined) => Promise<string | null>;

/**
 * Prepara el descifrador para una llave maestra. Lanza si la llave no mide 32
 * bytes: sin llave válida se falla cerrado, nunca se muestra el texto cifrado
 * como si fuera el dato.
 */
export async function createPiiOpener(masterKeyBase64: string): Promise<PiiOpener> {
	const master = decodeBase64(String(masterKeyBase64 ?? "").trim());
	if (master.length !== 32) throw new Error("pii_key_invalid");

	const hkdfKey = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveKey"]);
	const key = await crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new Uint8Array(0),
			info: new TextEncoder().encode(ENCRYPTION_INFO),
		},
		hkdfKey,
		{ name: "AES-GCM", length: 256 },
		false,
		["decrypt"],
	);

	return async (value) => {
		if (value == null) return null;
		// Los valores antiguos en claro se devuelven tal cual, igual que en el Portal.
		if (!isSealedPii(value)) return value;

		const packed = decodeBase64Url(value.slice(SEALED_PREFIX.length));
		if (packed.length < IV_BYTES + TAG_BYTES) throw new Error("pii_open_failed");
		const iv = packed.subarray(0, IV_BYTES);
		const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
		const body = packed.subarray(IV_BYTES + TAG_BYTES);

		// WebCrypto espera el tag pegado al final del texto cifrado.
		const withTag = new Uint8Array(body.length + TAG_BYTES);
		withTag.set(body, 0);
		withTag.set(tag, body.length);

		try {
			const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, withTag);
			return new TextDecoder().decode(plain);
		} catch {
			// Llave equivocada o dato alterado: GCM lo detecta. No se devuelve basura.
			throw new Error("pii_open_failed");
		}
	};
}
