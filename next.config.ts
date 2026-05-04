import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

const panelRoot = __dirname;
for (const path of [resolve(panelRoot, ".env"), resolve(panelRoot, ".env.local")]) {
	if (existsSync(path)) loadEnv({ path, override: true });
}

const isAndroidBuild = process.env.BUILD_TARGET === "android";

const nextConfig: NextConfig = {
	...(isAndroidBuild ? { output: "export" } : {}),
	turbopack: {
		root: resolve(__dirname),
	},
	images: {
		...(isAndroidBuild ? { unoptimized: true } : {}),
		remotePatterns: [
			{ protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
			{ protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
		],
	},
};

export default nextConfig;
