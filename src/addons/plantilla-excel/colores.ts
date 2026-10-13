export type ColorOption = { value: string; name: string };

/** Rellenos: una fila suave y una fuerte, como la paleta de Excel. */
export const FILL_COLORS: ColorOption[] = [
	{ value: "#fde2e1", name: "Rojo claro" },
	{ value: "#ffe8cc", name: "Naranjo claro" },
	{ value: "#fff4bf", name: "Amarillo claro" },
	{ value: "#dff5e1", name: "Verde claro" },
	{ value: "#d9f2f2", name: "Turquesa claro" },
	{ value: "#ddeffe", name: "Celeste claro" },
	{ value: "#eadcfb", name: "Violeta claro" },
	{ value: "#eceef1", name: "Gris claro" },
	{ value: "#f87171", name: "Rojo" },
	{ value: "#fb923c", name: "Naranjo" },
	{ value: "#facc15", name: "Amarillo" },
	{ value: "#4ade80", name: "Verde" },
	{ value: "#2dd4bf", name: "Turquesa" },
	{ value: "#60a5fa", name: "Azul" },
	{ value: "#a78bfa", name: "Violeta" },
	{ value: "#9ca3af", name: "Gris" },
];

export const TEXT_COLORS: ColorOption[] = [
	{ value: "#111827", name: "Negro" },
	{ value: "#6b7280", name: "Gris" },
	{ value: "#dc2626", name: "Rojo" },
	{ value: "#ea580c", name: "Naranjo" },
	{ value: "#ca8a04", name: "Mostaza" },
	{ value: "#16a34a", name: "Verde" },
	{ value: "#0d9488", name: "Turquesa" },
	{ value: "#2563eb", name: "Azul" },
	{ value: "#7c3aed", name: "Violeta" },
	{ value: "#db2777", name: "Rosado" },
];

/** Letra de una celda con relleno y sin color propio: oscura, para que se lea también en tema oscuro. */
export const TEXT_ON_FILL = "#111827";
