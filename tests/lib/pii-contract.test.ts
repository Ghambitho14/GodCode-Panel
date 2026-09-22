// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createPiiOpener, isSealedPii } from "../../supabase/functions/_shared/pii.ts";
import {
	PII_CONTRACT_CASES,
	PII_CONTRACT_TEST_KEY,
} from "../../supabase/functions/_shared/pii-contract-cases.ts";

/**
 * Contrato del cifrado de datos personales.
 *
 * Los casos los selló el Portal con `sealPii` (Node) y su propio test comprueba
 * que su `openPii` los abre. Aquí el port en WebCrypto de la Edge Function
 * `client-pii` tiene que abrirlos igual: si no, la caja no puede mostrar lo que
 * el menú guardó.
 */
describe("createPiiOpener — contrato compartido con el Portal", () => {
	for (const testCase of PII_CONTRACT_CASES) {
		it(testCase.name, async () => {
			const open = await createPiiOpener(PII_CONTRACT_TEST_KEY);
			await expect(open(testCase.sealed)).resolves.toBe(testCase.plain);
		});
	}

	it("deja pasar valores antiguos en claro y null", async () => {
		const open = await createPiiOpener(PII_CONTRACT_TEST_KEY);
		await expect(open("+56 9 1234 5678")).resolves.toBe("+56 9 1234 5678");
		await expect(open(null)).resolves.toBeNull();
		expect(isSealedPii("+56 9 1234 5678")).toBe(false);
		expect(isSealedPii(PII_CONTRACT_CASES[0].sealed)).toBe(true);
	});

	it("falla cerrado con otra llave o con el dato alterado", async () => {
		const otraLlave = await createPiiOpener(btoa(String.fromCharCode(...new Uint8Array(32).fill(7))));
		await expect(otraLlave(PII_CONTRACT_CASES[0].sealed)).rejects.toThrow("pii_open_failed");

		const open = await createPiiOpener(PII_CONTRACT_TEST_KEY);
		const sealed = PII_CONTRACT_CASES[0].sealed;
		const alterado = sealed.slice(0, -2) + (sealed.endsWith("AA") ? "BB" : "AA");
		await expect(open(alterado)).rejects.toThrow("pii_open_failed");
	});

	it("rechaza una llave que no mide 32 bytes", async () => {
		await expect(createPiiOpener("")).rejects.toThrow("pii_key_invalid");
		await expect(createPiiOpener(btoa("corta"))).rejects.toThrow("pii_key_invalid");
	});
});
