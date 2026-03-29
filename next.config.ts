import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

/**
 * En monorepo, `next dev` suele ejecutarse desde `services/tenant-panel` y Next solo
 * carga `.env*` de esa carpeta. Aquí incorporamos el `.env` de la raíz del repo
 * (mismas claves que el monolito) y luego las del panel si existen.
 */
const repoRoot = resolve(__dirname, "../..");
const panelRoot = __dirname;
for (const path of [resolve(repoRoot, ".env"), resolve(repoRoot, ".env.local")]) {
	if (existsSync(path)) loadEnv({ path, override: path.endsWith(".env.local") });
}
for (const path of [resolve(panelRoot, ".env"), resolve(panelRoot, ".env.local")]) {
	if (existsSync(path)) loadEnv({ path, override: true });
}

const nextConfig: NextConfig = {
	turbopack: {
		root: resolve(__dirname),
	},
	images: {
		remotePatterns: [
			{ protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
			{ protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
		],
	},
};

export default nextConfig;
