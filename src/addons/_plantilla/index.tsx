import { lazy } from "react";

import type { AddonManifest, AddonModule } from "../types";
import manifest from "./manifest.json";

/**
 * Plantilla de un extra a medida. Para crear uno: copia esta carpeta con el nombre del
 * módulo (p. ej. `cuadre-caja`), cambia `id` en `manifest.json` por ese nombre y arma la
 * pantalla en Screen. Las carpetas que empiezan con `_` no se registran.
 */
const addon: AddonModule = {
	...(manifest as AddonManifest),
	Component: lazy(() => import("./Screen")),
};

export default addon;
