// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createSecretBox, isSealedSecret, secretLast4 } from "../../supabase/functions/_shared/secret-box.ts";
import {
	buildUnsubscribeUrl,
	signUnsubscribe,
	verifyUnsubscribe,
} from "../../supabase/functions/_shared/unsubscribe-token.ts";
import {
	SECRET_BOX_CASES,
	SECRET_BOX_TEST_KEY,
	UNSUBSCRIBE_CASES,
	UNSUBSCRIBE_TEST_SECRET,
} from "../../supabase/functions/_shared/email-contract-cases.ts";

/**
 * Contrato de los correos de cupones con GodCode: el super admin sella la API key
 * del Resend propio y la Edge Function la abre; la función firma el enlace de baja y
 * GodCode lo verifica. GodCode corre estos mismos casos.
 */
describe("secret-box — contrato con GodCode", () => {
	for (const testCase of SECRET_BOX_CASES) {
		it(`abre lo sellado: ${testCase.name}`, async () => {
			const box = await createSecretBox(SECRET_BOX_TEST_KEY);
			await expect(box.open(testCase.sealed)).resolves.toBe(testCase.plain);
		});
	}

	it("lo que sella lo abre, y cada sellado es distinto", async () => {
		const box = await createSecretBox(SECRET_BOX_TEST_KEY);
		const a = await box.seal("re_abc_123456789");
		const b = await box.seal("re_abc_123456789");
		expect(isSealedSecret(a)).toBe(true);
		expect(a).not.toBe(b);
		await expect(box.open(a)).resolves.toBe("re_abc_123456789");
	});

	it("falla cerrado con otra llave, con el dato alterado o sin prefijo", async () => {
		const otra = await createSecretBox(btoa(String.fromCharCode(...new Uint8Array(32).fill(7))));
		await expect(otra.open(SECRET_BOX_CASES[0].sealed)).rejects.toThrow("secret_open_failed");

		const box = await createSecretBox(SECRET_BOX_TEST_KEY);
		const sealed = SECRET_BOX_CASES[0].sealed;
		const alterado = sealed.slice(0, -2) + (sealed.endsWith("AA") ? "BB" : "AA");
		await expect(box.open(alterado)).rejects.toThrow("secret_open_failed");
		await expect(box.open("re_en_claro")).rejects.toThrow("secret_open_failed");
	});

	it("rechaza una llave que no mide 32 bytes", async () => {
		await expect(createSecretBox("")).rejects.toThrow("secret_key_invalid");
		await expect(createSecretBox(btoa("corta"))).rejects.toThrow("secret_key_invalid");
	});

	it("muestra solo los últimos 4 de una key larga", () => {
		expect(secretLast4("re_123456789_abcd")).toBe("abcd");
		expect(secretLast4("corta")).toBe("");
	});
});

describe("enlace de baja — contrato con GodCode", () => {
	for (const testCase of UNSUBSCRIBE_CASES) {
		it("firma igual que GodCode", async () => {
			await expect(signUnsubscribe(UNSUBSCRIBE_TEST_SECRET, testCase.accountId, testCase.companyId)).resolves.toBe(
				testCase.signature,
			);
			await expect(
				verifyUnsubscribe(UNSUBSCRIBE_TEST_SECRET, testCase.accountId, testCase.companyId, testCase.signature),
			).resolves.toBe(true);
		});
	}

	it("una firma no sirve para otra cuenta ni otra empresa", async () => {
		const { accountId, companyId, signature } = UNSUBSCRIBE_CASES[0];
		const otraCuenta = "99999999-2222-4333-8444-555555555555";
		await expect(verifyUnsubscribe(UNSUBSCRIBE_TEST_SECRET, otraCuenta, companyId, signature)).resolves.toBe(false);
		await expect(verifyUnsubscribe(UNSUBSCRIBE_TEST_SECRET, accountId, otraCuenta, signature)).resolves.toBe(false);
		await expect(verifyUnsubscribe(UNSUBSCRIBE_TEST_SECRET, accountId, companyId, "")).resolves.toBe(false);
		await expect(verifyUnsubscribe(UNSUBSCRIBE_TEST_SECRET, "no-es-uuid", companyId, signature)).resolves.toBe(false);
	});

	it("arma la URL con los tres parámetros y exige un secreto largo", async () => {
		const { accountId, companyId, signature } = UNSUBSCRIBE_CASES[0];
		const url = new URL(await buildUnsubscribeUrl("https://www.godcode.me/", UNSUBSCRIBE_TEST_SECRET, accountId, companyId));
		expect(url.origin + url.pathname).toBe("https://www.godcode.me/api/email/unsubscribe");
		expect(url.searchParams.get("a")).toBe(accountId);
		expect(url.searchParams.get("c")).toBe(companyId);
		expect(url.searchParams.get("s")).toBe(signature);
		await expect(signUnsubscribe("corto", accountId, companyId)).rejects.toThrow("unsubscribe_secret_invalid");
	});
});
