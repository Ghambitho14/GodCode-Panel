import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const nextConfig = require("eslint-config-next");

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
	...nextConfig,
	{
		rules: {
			// Legacy admin/tenant: data-fetch on mount and patterns React Compiler flags.
			"react-hooks/set-state-in-effect": "off",
			"react-hooks/purity": "off",
		},
	},
];

export default eslintConfig;
