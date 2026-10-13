import { lazy } from "react";

import type { AddonManifest, AddonModule } from "../types";
import manifest from "./manifest.json";

/** Hoja de cálculo tipo Excel: celdas A1, B2…, fórmulas con + - * /, SUMA y varias hojas. */
const addon: AddonModule = {
	...(manifest as AddonManifest),
	Component: lazy(() => import("./Screen")),
};

export default addon;
