import type { CapacitorConfig } from "@capacitor/cli";
import { existsSync } from "fs";
import { resolve } from "path";
import { config as loadEnv } from "dotenv";

/**
 * Shell WebView para Android (Capacitor).
 *
 * Por qué hay URL: el APK no incluye el servidor Next; la WebView carga la app como Chrome.
 * Pon la dirección **una vez** en `.env` o `.env.local` (no hace falta exportar en cada terminal):
 *
 * - Emulador Android Studio → suele ser http://10.0.2.2:3002 (equivale al localhost de tu PC).
 * - Móvil en la misma Wi‑Fi → http://TU_IP_LAN:3002
 * - Producción → https://tu-dominio.com
 *
 * CAPACITOR_ANDROID_CLEARTEXT=true solo si usas http en desarrollo.
 */
const panelRoot = process.cwd();
for (const file of [".env.local", ".env"] as const) {
	const p = resolve(panelRoot, file);
	if (existsSync(p)) loadEnv({ path: p, override: file === ".env.local" });
}

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
	appId: "io.godcode.tenantpanel",
	appName: "Panel del negocio",
	webDir: "out",
	...(serverUrl
		? {
				server: {
					url: serverUrl,
					cleartext: process.env.CAPACITOR_ANDROID_CLEARTEXT === "true",
				},
			}
		: {}),
};

export default config;
