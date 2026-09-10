import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: [
			".claude/**", // worktrees de agentes: copias del repo con bundles ya compilados.
			"dist/**",
			"dev-dist/**",
			"test-results/**",
			"node_modules/**",
			"public/**",
			"supabase/functions/**", // Deno: su propio runtime y tipos, no los de este tsconfig.
		],
	},

	js.configs.recommended,
	...tseslint.configs.recommended,

	{
		files: ["**/*.{js,jsx,ts,tsx}"],
		languageOptions: {
			ecmaVersion: 2022,
			globals: { ...globals.browser, ...globals.es2021 },
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: {
			"react-hooks": reactHooks,
			"react-refresh": reactRefresh,
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			// Reglas de la era React Compiler (plugin v7). Señalan patrones mejorables,
			// no fallos de corrección, y el panel tiene 90+ casos heredados. Quedan en
			// `warn` para que sean visibles sin bloquear el merge; el objetivo es ir
			// bajándolas a `error` a medida que se limpian.
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/refs": "warn",
			"react-hooks/purity": "warn",
			"react-hooks/preserve-manual-memoization": "warn",
			"react-hooks/immutability": "warn",
			"react-hooks/static-components": "warn",
			"react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
			// Prefijo `_` marca lo intencionadamente sin usar (igual que en el Portal).
			"@typescript-eslint/no-unused-vars": ["warn", {
				varsIgnorePattern: "^_",
				argsIgnorePattern: "^_",
				destructuredArrayIgnorePattern: "^_",
			}],
			"no-console": ["warn", { allow: ["warn", "error"] }],
			// `try { … } catch {}` es el idioma del panel para lecturas best-effort
			// (sessionStorage, permisos de geolocalización). Un bloque vacío ahí es
			// deliberado; el resto de bloques vacíos siguen siendo error.
			"no-empty": ["error", { allowEmptyCatch: true }],
			// El panel usa espacios finos (U+202F) dentro de plantillas para separar
			// cifra y símbolo ("12 %"). Es tipografía deliberada, no un carácter colado.
			"no-irregular-whitespace": ["error", { skipTemplates: true }],
		},
	},

	// Shims de módulos JS sin tipar: `any` es justamente su propósito.
	{
		files: ["**/*.d.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},

	// El BFF y los scripts corren en Node, no en el navegador.
	{
		files: ["api/**/*.ts", "server.js", "scripts/**/*.{js,mjs}", "vite/**/*.{js,ts}", "*.config.{js,ts,mjs}"],
		languageOptions: {
			globals: { ...globals.node },
		},
		rules: {
			"no-console": "off",
		},
	},

	// Los tests usan globals de Vitest y mocks que rompen reglas de tipado estricto.
	{
		files: ["tests/**/*.{js,jsx,ts,tsx}"],
		languageOptions: {
			globals: { ...globals.node, ...globals.browser },
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"no-console": "off",
			// Los tests envuelven hooks en helpers para poder ejercitarlos fuera de
			// un componente; la regla no distingue ese caso del uso real.
			"react-hooks/rules-of-hooks": "off",
		},
	},
);
