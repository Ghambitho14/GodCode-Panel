import { describe, expect, it } from "vitest";

import { buildTenantThemeCss } from "@/shared/utils/panel-theme-css";
import {
	PORTAL_ONLY_THEME_CSS_VARS,
	SHARED_THEME_CSS_VARS,
	extractCssVarNames,
} from "@/shared/utils/theme-css-var-contract";

/**
 * El gemelo de este fichero vive en
 * `saas-godcode-admin/__tests__/lib/store-theme/theme-css-var-contract.test.ts`.
 *
 * Un token renombrado en un solo repo no lanza ningún error: `var(--lo-que-sea)`
 * se queda vacío y el color cae al heredado. La UI se ve descolorida en un lado
 * y nadie se entera. Estos tests convierten ese silencio en un fallo.
 */
describe("contrato de variables CSS del tema", () => {
	const css = buildTenantThemeCss(null);

	it("emite exactamente los tokens compartidos, en el orden del contrato", () => {
		expect(extractCssVarNames(css)).toEqual([...SHARED_THEME_CSS_VARS]);
	});

	it("ningún token compartido sale con valor vacío", () => {
		for (const name of SHARED_THEME_CSS_VARS) {
			expect(css).toMatch(new RegExp(`${name}:[^;]+;`));
		}
	});

	it("no emite los tokens de la capa de fondo, que son solo del Portal", () => {
		// El Panel POS no tiene imagen de fondo con tint. Si alguno aparece aquí,
		// es que se copió código del storefront sin la UI que lo usa.
		for (const name of PORTAL_ONLY_THEME_CSS_VARS) {
			expect(css).not.toContain(name);
		}
	});

	it("aplica al scope del modal portaleado además de al contenedor normal", () => {
		// El modal de pedido manual se monta en <body>, fuera de .tenant-theme-vars.
		expect(css).toContain(".tenant-theme-vars,.manual-order-portal-scope{");
	});

	it("el tema del tenant no cambia la paleta: el Panel es herramienta interna", () => {
		const conTema = buildTenantThemeCss({
			theme_config: { primaryColor: "#ff0000" } as never,
		});
		expect(conTema).toBe(css);
	});
});
