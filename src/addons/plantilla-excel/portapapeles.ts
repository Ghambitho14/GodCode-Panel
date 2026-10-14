/**
 * Portapapeles de la hoja: leer lo que se copia en Excel, Google Sheets o LibreOffice (texto con
 * tabulaciones y, si viene, el HTML con el formato) y armar lo que se copia desde aquí para pegarlo
 * allá. Sin React; el HTML se lee con `DOMParser`, que no ejecuta nada ni lo mete en la página.
 */

import { cleanStyle, DEFAULT_FONT_SIZE, literalValue, type CellAlign, type CellBorder, type CellStyle } from "./hoja-calculo";

/** Texto con tabulaciones → filas × columnas (todas del mismo largo). Vacío → `[]`. */
export function parseTsv(text: string): string[][] {
	if (!text) return [];
	let src = text.replace(/\r\n?/g, "\n");
	// Excel termina con un salto de línea; no es una fila más.
	if (src.endsWith("\n")) src = src.slice(0, -1);
	const rows: string[][] = [];
	let row: string[] = [];
	let i = 0;
	for (;;) {
		let field: string | null = null;
		if (src[i] === '"') {
			// Entre comillas (celdas con saltos de línea o tabulaciones); "" es una comilla.
			let j = i + 1;
			let value = "";
			let closed = false;
			while (j < src.length) {
				if (src[j] === '"') {
					if (src[j + 1] === '"') {
						value += '"';
						j += 2;
						continue;
					}
					closed = true;
					j += 1;
					break;
				}
				value += src[j];
				j += 1;
			}
			if (closed && (j >= src.length || src[j] === "\t" || src[j] === "\n")) {
				field = value;
				i = j;
			}
		}
		if (field === null) {
			let end = i;
			while (end < src.length && src[end] !== "\t" && src[end] !== "\n") end += 1;
			field = src.slice(i, end);
			i = end;
		}
		row.push(field);
		if (i >= src.length) {
			rows.push(row);
			break;
		}
		if (src[i] === "\n") {
			rows.push(row);
			row = [];
		}
		i += 1;
	}
	const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
	return rows.map((r) => (r.length < width ? [...r, ...Array<string>(width - r.length).fill("")] : r));
}

/** Filas × columnas → texto con tabulaciones, como lo deja Excel. */
export function toTsv(values: string[][]): string {
	const field = (v: string) => (/[\t\n\r]/.test(v) || v.startsWith('"') ? `"${v.replace(/"/g, '""')}"` : v);
	return values.map((row) => row.map(field).join("\t")).join("\r\n");
}

// --- Colores ---

const NAMED_COLORS: Record<string, string> = {
	black: "#000000",
	windowtext: "#000000",
	white: "#ffffff",
	window: "#ffffff",
	red: "#ff0000",
	green: "#008000",
	lime: "#00ff00",
	blue: "#0000ff",
	navy: "#000080",
	yellow: "#ffff00",
	orange: "#ffa500",
	purple: "#800080",
	fuchsia: "#ff00ff",
	magenta: "#ff00ff",
	aqua: "#00ffff",
	cyan: "#00ffff",
	teal: "#008080",
	olive: "#808000",
	maroon: "#800000",
	gray: "#808080",
	grey: "#808080",
	silver: "#c0c0c0",
};

/** `#abc`, `#aabbcc`, `rgb(…)` o un nombre conocido → `#rrggbb`. Transparente o desconocido → `null`. */
function toHex(value: string): string | null {
	const v = value.trim().toLowerCase();
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
	if (hex) {
		const h = hex[1];
		return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
	}
	const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
	if (rgb) {
		if (rgb[4] !== undefined && Number.parseFloat(rgb[4]) === 0) return null;
		return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
	}
	return NAMED_COLORS[v] ?? null;
}

/** El primer color dentro de un valor con varias partes (`background: #ff0 none`, `border: 1px solid red`). */
function colorIn(value: string): string | null {
	for (const token of value.match(/rgba?\([^)]*\)|#[0-9a-f]{3,6}\b|[a-z]+/gi) ?? []) {
		const hex = toHex(token);
		if (hex) return hex;
	}
	return null;
}

const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

// --- Formato de cada celda ---

type Decl = [prop: string, value: string];

function parseDeclarations(text: string): Decl[] {
	const out: Decl[] = [];
	for (const part of text.split(";")) {
		const at = part.indexOf(":");
		if (at <= 0) continue;
		const value = part
			.slice(at + 1)
			.trim()
			.replace(/\s*!important$/i, "");
		out.push([part.slice(0, at).trim().toLowerCase(), value]);
	}
	return out;
}

/** Reglas de los `<style>`: las de `td` (las de todas las celdas) y las de cada clase (`.xl65` de Excel). */
function parseCssRules(doc: Document): { cell: Decl[]; classes: Map<string, Decl[]> } {
	const cell: Decl[] = [];
	const classes = new Map<string, Decl[]>();
	for (const el of Array.from(doc.querySelectorAll("style"))) {
		const css = (el.textContent ?? "").replace(/<!--|-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
		for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			const decls = parseDeclarations(match[2]);
			for (const selector of match[1].split(",")) {
				const s = selector.trim().toLowerCase();
				if (s === "td" || s === "th") {
					cell.push(...decls);
					continue;
				}
				const cls = /^(?:td|th|span|font)?\.([\w-]+)$/.exec(s);
				if (cls) classes.set(cls[1], [...(classes.get(cls[1]) ?? []), ...decls]);
			}
		}
	}
	return { cell, classes };
}

/** Formato tal como viene, antes de decidir qué se guarda. */
type RawStyle = {
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
	sizePt?: number;
	color?: string | null;
	bg?: string | null;
	align?: string;
	border: Record<keyof CellBorder, boolean>;
};

/** `11.0pt`, `14px` → puntos. */
function fontSizePt(value: string): number | null {
	const m = /^([\d.]+)\s*(pt|px)?$/i.exec(value.trim());
	if (!m) return null;
	const n = Number.parseFloat(m[1]);
	if (!Number.isFinite(n) || n <= 0) return null;
	return Math.round(m[2]?.toLowerCase() === "px" ? n * 0.75 : n);
}

/** `<font size="1…7">` de LibreOffice → puntos. */
const FONT_TAG_SIZES: Record<string, number> = { 1: 8, 2: 10, 3: 12, 4: 14, 5: 18, 6: 24, 7: 36 };

/**
 * ¿Ese borde se ve? `none`, ancho 0 o gris claro (las líneas de cuadrícula que pone Google Sheets)
 * no cuentan.
 */
function borderVisible(value: string): boolean {
	const v = value.trim().toLowerCase();
	if (/\b(none|hidden)\b/.test(v)) return false;
	const width = /^([\d.]+)(px|pt|em)?$/.exec(v.split(/\s+/)[0]);
	if (width && Number.parseFloat(width[1]) === 0) return false;
	const color = colorIn(v);
	if (color && channels(color).every((c) => c >= 0xc0)) return false;
	return true;
}

const SIDES: Record<string, keyof CellBorder> = { top: "t", right: "r", bottom: "b", left: "l" };

function applyDecls(acc: RawStyle, decls: Decl[], withBorders: boolean) {
	for (const [prop, value] of decls) {
		const v = value.toLowerCase();
		if (prop === "font-weight") acc.bold = v === "bold" || v === "bolder" || Number(v) >= 600;
		else if (prop === "font-style") acc.italic = v === "italic" || v === "oblique";
		else if (prop === "text-decoration" || prop === "text-decoration-line") {
			acc.underline = v.includes("underline");
			acc.strike = v.includes("line-through");
		} else if (prop === "text-underline-style") acc.underline = v !== "none";
		else if (prop === "text-line-through") acc.strike = v !== "none";
		else if (prop === "font-size") acc.sizePt = fontSizePt(v) ?? acc.sizePt;
		else if (prop === "color") acc.color = colorIn(v);
		else if (prop === "background" || prop === "background-color") acc.bg = colorIn(v);
		else if (prop === "text-align") acc.align = v;
		else if (withBorders && prop === "border") {
			const on = borderVisible(v);
			acc.border = { t: on, r: on, b: on, l: on };
		} else if (withBorders && prop.startsWith("border-")) {
			const side = SIDES[prop.slice("border-".length)];
			if (side) acc.border[side] = borderVisible(v);
		}
	}
}

/** Lo que dicen las etiquetas que envuelven todo el texto: `<b>`, `<i>`, `<u>`, `<s>`, `<font>`. */
function applyTag(acc: RawStyle, el: Element) {
	const tag = el.tagName.toLowerCase();
	if (tag === "b" || tag === "strong") acc.bold = true;
	else if (tag === "i" || tag === "em") acc.italic = true;
	else if (tag === "u") acc.underline = true;
	else if (tag === "s" || tag === "strike" || tag === "del") acc.strike = true;
	else if (tag === "font") {
		const color = el.getAttribute("color");
		if (color) acc.color = colorIn(color);
		const size = FONT_TAG_SIZES[el.getAttribute("size")?.trim() ?? ""];
		if (size) acc.sizePt = size;
	}
}

function rawStyleOf(cell: Element, rules: ReturnType<typeof parseCssRules>): RawStyle {
	const acc: RawStyle = { border: { t: false, r: false, b: false, l: false } };
	// Los bordes de la regla general `td` son la cuadrícula (Google Sheets), no bordes de verdad.
	applyDecls(acc, rules.cell, false);
	const fromClasses = (el: Element, withBorders: boolean) => {
		for (const cls of Array.from(el.classList)) applyDecls(acc, rules.classes.get(cls.toLowerCase()) ?? [], withBorders);
	};
	fromClasses(cell, true);
	const align = cell.getAttribute("align");
	if (align) acc.align = align.toLowerCase();
	const bgcolor = cell.getAttribute("bgcolor");
	if (bgcolor) acc.bg = colorIn(bgcolor);
	applyDecls(acc, parseDeclarations(cell.getAttribute("style") ?? ""), true);
	// Etiquetas que envuelven todo el texto de la celda (no un pedazo).
	const text = (cell.textContent ?? "").trim();
	if (text) {
		for (const el of Array.from(cell.querySelectorAll("*"))) {
			if ((el.textContent ?? "").trim() !== text) continue;
			applyTag(acc, el);
			fromClasses(el, false);
			applyDecls(acc, parseDeclarations(el.getAttribute("style") ?? ""), false);
		}
	}
	return acc;
}

/**
 * Una posición de la grilla. En una celda combinada, todas sus posiciones apuntan a la misma celda
 * HTML: `first` es la de arriba a la izquierda (la que lleva el texto) y `edges`, los lados de esta
 * posición que son orilla de la combinación.
 */
type GridSlot = { el: Element; first: boolean; edges: Record<keyof CellBorder, boolean> };

/** Celdas de la tabla en su lugar, respetando las combinadas (`colspan`, `rowspan`). */
function cellGrid(table: HTMLTableElement): Array<Array<GridSlot | null>> {
	const grid: Array<Array<GridSlot | undefined>> = [];
	// Excel a veces suma una fila oculta y vacía para medir columnas; no es parte de lo copiado.
	const rows = Array.from(table.rows).filter(
		(tr) => !(/display\s*:\s*none/i.test(tr.getAttribute("style") ?? "") && !(tr.textContent ?? "").trim()),
	);
	rows.forEach((tr, r) => {
		grid[r] ??= [];
		let c = 0;
		for (const cell of Array.from(tr.cells)) {
			while (grid[r][c] !== undefined) c += 1;
			const rowSpan = Math.max(1, cell.rowSpan || 1);
			const colSpan = Math.max(1, cell.colSpan || 1);
			for (let dr = 0; dr < rowSpan; dr += 1) {
				grid[r + dr] ??= [];
				for (let dc = 0; dc < colSpan; dc += 1) {
					grid[r + dr][c + dc] = {
						el: cell,
						first: dr === 0 && dc === 0,
						edges: { t: dr === 0, r: dc === colSpan - 1, b: dr === rowSpan - 1, l: dc === 0 },
					};
				}
			}
			c += colSpan;
		}
	});
	return grid.map((row) => Array.from(row, (slot) => slot ?? null));
}

/** El tamaño que más se repite (contando las celdas sin tamaño); en empate, el normal o el menor. */
function commonSize(sizes: Array<number | undefined>): number | undefined {
	const counts = new Map<number | undefined, number>();
	for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
	let best: number | undefined;
	let bestCount = -1;
	for (const [size, count] of counts) {
		const rank = (s: number | undefined) => (s === undefined || s === DEFAULT_FONT_SIZE ? -1 : s);
		if (count > bestCount || (count === bestCount && rank(size) < rank(best))) {
			best = size;
			bestCount = count;
		}
	}
	return best;
}

function toCellStyle(raw: RawStyle, normalSize: number | undefined, value: string): CellStyle | null {
	const isNumber = typeof literalValue(value) === "number";
	const color = raw.color && channels(raw.color).some((c) => c > 0x10) ? raw.color : undefined;
	const bg = raw.bg && channels(raw.bg).some((c) => c < 0xf8) ? raw.bg : undefined;
	let align: CellAlign | undefined;
	if (raw.align === "center" || raw.align === "middle") align = "center";
	// Izquierda en un texto y derecha en un número ya son lo normal: no hace falta guardarlo.
	else if (raw.align === "left" && isNumber) align = "left";
	else if (raw.align === "right" && !isNumber) align = "right";
	const border: CellBorder = {};
	for (const side of ["t", "r", "b", "l"] as const) if (raw.border[side]) border[side] = true;
	return cleanStyle({
		bg,
		color,
		bold: raw.bold || undefined,
		italic: raw.italic || undefined,
		underline: raw.underline || undefined,
		strike: raw.strike || undefined,
		size: raw.sizePt !== undefined && raw.sizePt !== normalSize ? raw.sizePt : undefined,
		align,
		border,
	});
}

/**
 * Formato de cada celda del HTML copiado, en la misma grilla que `values` (lo que trae el texto).
 * Si la tabla no calza con el texto, o no hay HTML que leer, `null`: se pegan solo los valores.
 *
 * Para no traer basura: el tamaño más común cuenta como el normal, el negro como letra automática
 * (se lee en tema oscuro), el blanco como sin relleno, y la alineación que ya es la de siempre no se
 * guarda.
 */
export function parseClipboardHtml(html: string, values: string[][]): Array<Array<CellStyle | null>> | null {
	const rows = values.length;
	const cols = values[0]?.length ?? 0;
	if (!html.trim() || rows === 0 || cols === 0 || typeof DOMParser === "undefined") return null;
	const doc = new DOMParser().parseFromString(html, "text/html");
	const rules = parseCssRules(doc);
	// Sheets deja su `<style>` dentro del cuerpo: que su texto no se mezcle con el de las celdas.
	for (const el of Array.from(doc.querySelectorAll("style, script"))) el.remove();
	const table = doc.querySelector("table");
	let grid: Array<Array<GridSlot | null>>;
	if (table) grid = cellGrid(table as HTMLTableElement);
	else if (rows === 1 && cols === 1) grid = [[{ el: doc.body, first: true, edges: { t: true, r: true, b: true, l: true } }]];
	else return null;
	if (grid.length !== rows || grid.some((row) => row.length !== cols)) return null;

	const rawByCell = new Map<Element, RawStyle>();
	const rawOf = (el: Element) => {
		let raw = rawByCell.get(el);
		if (!raw) {
			raw = rawStyleOf(el, rules);
			rawByCell.set(el, raw);
		}
		return raw;
	};
	const normalSize = commonSize(grid.flat().map((slot) => (slot?.first ? rawOf(slot.el).sizePt : undefined)));
	return grid.map((row, r) =>
		row.map((slot, c) => {
			if (!slot) return null;
			const raw = rawOf(slot.el);
			// Los bordes de una combinada van solo por su orilla.
			const border = {
				t: raw.border.t && slot.edges.t,
				r: raw.border.r && slot.edges.r,
				b: raw.border.b && slot.edges.b,
				l: raw.border.l && slot.edges.l,
			};
			// Las posiciones que cubre la combinada no llevan texto: toman el relleno y los bordes, para
			// que la franja se vea seguida.
			const style = slot.first ? { ...raw, border } : { border, bg: raw.bg };
			return toCellStyle(style, normalSize, values[r][c]);
		}),
	);
}

// --- Copiar desde aquí ---

const escapeHtml = (text: string) =>
	text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);

/** Formato de una celda como CSS en línea, que es lo que Excel y Sheets leen al pegar. */
function styleToCss(style: CellStyle | null | undefined): string {
	if (!style) return "";
	const css: string[] = [];
	if (style.bold) css.push("font-weight:700");
	if (style.italic) css.push("font-style:italic");
	const decoration = [style.underline && "underline", style.strike && "line-through"].filter(Boolean).join(" ");
	if (decoration) css.push(`text-decoration:${decoration}`);
	if (style.size) css.push(`font-size:${style.size}pt`);
	if (style.color) css.push(`color:${style.color}`);
	if (style.bg) css.push(`background:${style.bg}`);
	if (style.align) css.push(`text-align:${style.align}`);
	const sides = { t: "top", r: "right", b: "bottom", l: "left" } as const;
	for (const side of ["t", "r", "b", "l"] as const) {
		if (style.border?.[side]) css.push(`border-${sides[side]}:.5pt solid windowtext`);
	}
	return css.join(";");
}

/** Tabla HTML con los valores y el formato, para pegar en Excel o Sheets con formato. */
export function toHtml(values: string[][], styles: Array<Array<CellStyle | null | undefined>>): string {
	const body = values
		.map((row, r) => {
			const tds = row.map((value, c) => {
				const css = styleToCss(styles[r]?.[c]);
				return `<td${css ? ` style="${css}"` : ""}>${escapeHtml(value)}</td>`;
			});
			return `<tr>${tds.join("")}</tr>`;
		})
		.join("");
	return `<table><tbody>${body}</tbody></table>`;
}
