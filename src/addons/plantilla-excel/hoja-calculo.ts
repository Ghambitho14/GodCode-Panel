/**
 * Hoja de cálculo sencilla, parecida a Excel: columnas con letra (A, B… AA), filas con número y
 * fórmulas que empiezan con `=` (`+ - * /`, paréntesis, celdas como `B3` y `SUMA(A1:A31)`).
 *
 * Las celdas guardan lo que se escribió, no el resultado: el resultado sale de `evaluateSheet`.
 * Todo lo de aquí es puro (sin React) para poder probarlo.
 */

export type Sheet = {
	id: string;
	name: string;
	rows: number;
	cols: number;
	/** Lo escrito en cada celda, por nombre (`"A1"`). Las vacías no se guardan. */
	cells: Record<string, string>;
	/** Formato por celda. Va aparte del contenido: borrar una celda deja su formato, como en Excel. */
	styles: Record<string, CellStyle>;
};

export type CellAlign = "left" | "center" | "right";

/** Lados con borde: arriba, derecha, abajo, izquierda. */
export type CellBorder = { t?: true; r?: true; b?: true; l?: true };

/**
 * Formato de una celda. Relleno y letra como `#rrggbb`; `size` es el tamaño de letra como en Excel
 * (sin `size`, la normal: 11). Solo se guarda lo que la celda tiene.
 */
export type CellStyle = {
	bg?: string;
	color?: string;
	bold?: true;
	italic?: true;
	underline?: true;
	strike?: true;
	size?: number;
	align?: CellAlign;
	border?: CellBorder;
};

/** Negrita, cursiva, subrayado y tachado: se prenden y apagan. */
export type StyleFlag = "bold" | "italic" | "underline" | "strike";

/** Cambio de formato: `null` (o `false`) quita esa parte; lo que no se pasa queda como estaba. */
export type StylePatch = {
	bg?: string | null;
	color?: string | null;
	bold?: boolean | null;
	italic?: boolean | null;
	underline?: boolean | null;
	strike?: boolean | null;
	size?: number | null;
	align?: CellAlign | null;
};

/** Tamaño de letra normal (el de Excel); en pantalla son los 13 px de siempre. */
export const DEFAULT_FONT_SIZE = 11;
/** Tamaños de la lista, como en Excel. */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 72;

/** Bloque de celdas, con `c0 <= c1` y `r0 <= r1` (índices desde 0). */
export type CellRange = { c0: number; r0: number; c1: number; r1: number };

export type Workbook = {
	version: 1;
	sheets: Sheet[];
	activeSheetId: string;
};

export type SheetError = "#DIV/0!" | "#REF!" | "#CICLO!" | "#ERROR!" | "#VALOR!";

export type CellResult = { value: number | string | null; error?: SheetError };

export const DEFAULT_ROWS = 50;
export const DEFAULT_COLS = 26;
export const MAX_ROWS = 1000;
export const MAX_COLS = 52;
const MAX_SHEET_NAME = 31;

/** Niveles de zoom de la hoja, en %. */
export const ZOOM_STEPS = [50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200];

/** Zoom siguiente (`1`, acercar) o anterior (`-1`, alejar); en el borde se queda igual. */
export function stepZoom(current: number, direction: 1 | -1): number {
	if (direction > 0) return ZOOM_STEPS.find((z) => z > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
	return [...ZOOM_STEPS].reverse().find((z) => z < current) ?? ZOOM_STEPS[0];
}

/** Lee un zoom guardado; si no es uno de los niveles, 100 %. */
export function reviveZoom(raw: unknown): number {
	const value = Number(raw);
	return ZOOM_STEPS.includes(value) ? value : 100;
}

export function newId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnLabel(index: number): string {
	let n = Math.floor(index) + 1;
	let label = "";
	while (n > 0) {
		const rest = (n - 1) % 26;
		label = String.fromCharCode(65 + rest) + label;
		n = Math.floor((n - 1) / 26);
	}
	return label;
}

function columnIndex(label: string): number {
	let n = 0;
	for (const ch of label.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
	return n - 1;
}

/** Nombre de la celda; `col` y `row` empiezan en 0 (`cellKey(1, 2)` → `"B3"`). */
export function cellKey(col: number, row: number): string {
	return `${columnLabel(col)}${row + 1}`;
}

/** `"b12"` → `{ col: 1, row: 11 }`. Acepta `$` de Excel (`$B$12`). Inválida → `null`. */
export function parseCellRef(text: string): { col: number; row: number } | null {
	const match = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(String(text ?? "").trim());
	if (!match) return null;
	const row = Number(match[2]) - 1;
	if (row < 0) return null;
	return { col: columnIndex(match[1]), row };
}

/**
 * Lee un número escrito a mano: «62.500», «1.250,50», «1,5», «0.125».
 * Un solo separador seguido de 1 o 2 cifras (o tras un 0) es decimal; si no, separa miles.
 */
export function parseNumber(text: string): number {
	if (!/^\d[\d.,]*$|^[.,]\d+$/.test(text)) return Number.NaN;
	const lastDot = text.lastIndexOf(".");
	const lastComma = text.lastIndexOf(",");
	let normalized: string;
	if (lastDot >= 0 && lastComma >= 0) {
		// El que aparece al final es el decimal.
		normalized = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
	} else if (lastDot >= 0 || lastComma >= 0) {
		const sep = lastDot >= 0 ? "." : ",";
		const at = Math.max(lastDot, lastComma);
		const single = text.indexOf(sep) === at;
		const decimals = text.length - at - 1;
		const intPart = text.slice(0, at);
		const isDecimal = single && decimals > 0 && (decimals <= 2 || intPart === "" || intPart === "0");
		normalized = isDecimal ? text.replace(sep, ".") : text.split(sep).join("");
	} else {
		normalized = text;
	}
	const value = Number(normalized);
	return Number.isFinite(value) ? value : Number.NaN;
}

/** Lo que no es fórmula: vacío, número (con signo, `$` o espacios) o texto tal cual. */
export function literalValue(raw: string): number | string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const compact = trimmed.replace(/[\s$]/g, "");
	const sign = compact.startsWith("-") ? -1 : 1;
	const value = parseNumber(compact.replace(/^[+-]/, ""));
	return Number.isFinite(value) ? sign * value : trimmed;
}

class FormulaError extends Error {
	readonly code: SheetError;

	constructor(code: SheetError) {
		super(code);
		this.code = code;
	}
}

type Token =
	| { type: "num"; value: number }
	| { type: "ref"; col: number; row: number }
	| { type: "func"; name: string }
	| { type: "op"; value: string };

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < source.length) {
		const ch = source[i];
		if (/\s/.test(ch)) {
			i += 1;
			continue;
		}
		const rest = source.slice(i);
		const num = /^(\d[\d.,]*|[.,]\d+)/.exec(rest);
		if (num) {
			// Una coma al final («5,») es separador de argumentos, no decimal.
			const text = num[1].replace(/[.,]$/, "");
			const value = parseNumber(text);
			if (!Number.isFinite(value)) throw new FormulaError("#ERROR!");
			tokens.push({ type: "num", value });
			i += text.length;
			continue;
		}
		const word = /^\$?[A-Za-z]+\$?\d*/.exec(rest);
		if (word) {
			const text = word[0];
			const after = source.slice(i + text.length).trimStart();
			if (/\d$/.test(text)) {
				const ref = parseCellRef(text);
				if (!ref) throw new FormulaError("#REF!");
				tokens.push({ type: "ref", ...ref });
			} else if (after.startsWith("(")) {
				tokens.push({ type: "func", name: text.toUpperCase() });
			} else {
				throw new FormulaError("#ERROR!");
			}
			i += text.length;
			continue;
		}
		if ("+-*/():;,".includes(ch)) {
			tokens.push({ type: "op", value: ch });
			i += 1;
			continue;
		}
		// Lo deja `shiftFormula` cuando una celda copiada apunta fuera de la hoja.
		if (rest.toUpperCase().startsWith("#REF!")) throw new FormulaError("#REF!");
		throw new FormulaError("#ERROR!");
	}
	return tokens;
}

const SUM_NAMES = new Set(["SUMA", "SUM"]);

/** Calcula todas las celdas con algo escrito. Devuelve el resultado por nombre de celda. */
export function evaluateSheet(sheet: Sheet): Map<string, CellResult> {
	const results = new Map<string, CellResult>();
	const visiting = new Set<string>();

	const resultOf = (col: number, row: number): CellResult => {
		if (col < 0 || row < 0 || col >= sheet.cols || row >= sheet.rows) return { value: null, error: "#REF!" };
		const key = cellKey(col, row);
		const cached = results.get(key);
		if (cached) return cached;
		if (visiting.has(key)) return { value: null, error: "#CICLO!" };
		const raw = sheet.cells[key] ?? "";
		let result: CellResult;
		if (raw.trim().startsWith("=")) {
			visiting.add(key);
			try {
				result = { value: evaluateFormula(raw.trim().slice(1)) };
			} catch (err) {
				result = { value: null, error: err instanceof FormulaError ? err.code : "#ERROR!" };
			}
			visiting.delete(key);
		} else {
			result = { value: literalValue(raw) };
		}
		results.set(key, result);
		return result;
	};

	/** Valor de una celda dentro de una cuenta: vacía vale 0, texto es error. */
	const numberAt = (col: number, row: number): number => {
		const r = resultOf(col, row);
		if (r.error) throw new FormulaError(r.error);
		if (r.value === null) return 0;
		if (typeof r.value === "number") return r.value;
		throw new FormulaError("#VALOR!");
	};

	const evaluateFormula = (source: string): number => {
		const tokens = tokenize(source);
		let pos = 0;
		const peek = () => tokens[pos];
		const isOp = (value: string) => {
			const t = tokens[pos];
			return t?.type === "op" && t.value === value;
		};
		const expectOp = (value: string) => {
			if (!isOp(value)) throw new FormulaError("#ERROR!");
			pos += 1;
		};

		const sumArgs = (): number => {
			let total = 0;
			if (isOp(")")) throw new FormulaError("#ERROR!");
			for (;;) {
				const t = peek();
				const next = tokens[pos + 1];
				if (t?.type === "ref" && next?.type === "op" && next.value === ":") {
					const end = tokens[pos + 2];
					if (end?.type !== "ref") throw new FormulaError("#ERROR!");
					pos += 3;
					const [c0, c1] = [Math.min(t.col, end.col), Math.max(t.col, end.col)];
					const [r0, r1] = [Math.min(t.row, end.row), Math.max(t.row, end.row)];
					if (c1 >= sheet.cols || r1 >= sheet.rows) throw new FormulaError("#REF!");
					for (let r = r0; r <= r1; r += 1) {
						for (let c = c0; c <= c1; c += 1) {
							// En un rango, SUMA salta textos y vacías (como Excel).
							const cell = resultOf(c, r);
							if (cell.error) throw new FormulaError(cell.error);
							if (typeof cell.value === "number") total += cell.value;
						}
					}
				} else {
					total += expr();
				}
				if (isOp(";") || isOp(",")) {
					pos += 1;
					continue;
				}
				return total;
			}
		};

		const primary = (): number => {
			const t = peek();
			if (!t) throw new FormulaError("#ERROR!");
			if (t.type === "num") {
				pos += 1;
				return t.value;
			}
			if (t.type === "ref") {
				pos += 1;
				if (isOp(":")) throw new FormulaError("#ERROR!");
				return numberAt(t.col, t.row);
			}
			if (t.type === "func") {
				pos += 1;
				if (!SUM_NAMES.has(t.name)) throw new FormulaError("#ERROR!");
				expectOp("(");
				const value = sumArgs();
				expectOp(")");
				return value;
			}
			if (t.value === "(") {
				pos += 1;
				const value = expr();
				expectOp(")");
				return value;
			}
			throw new FormulaError("#ERROR!");
		};

		const unary = (): number => {
			if (isOp("-")) {
				pos += 1;
				return -unary();
			}
			if (isOp("+")) {
				pos += 1;
				return unary();
			}
			return primary();
		};

		const term = (): number => {
			let value = unary();
			while (isOp("*") || isOp("/")) {
				const op = (peek() as { value: string }).value;
				pos += 1;
				const right = unary();
				if (op === "*") value *= right;
				else {
					if (right === 0) throw new FormulaError("#DIV/0!");
					value /= right;
				}
			}
			return value;
		};

		function expr(): number {
			let value = term();
			while (isOp("+") || isOp("-")) {
				const op = (peek() as { value: string }).value;
				pos += 1;
				const right = term();
				value = op === "+" ? value + right : value - right;
			}
			return value;
		}

		if (tokens.length === 0) throw new FormulaError("#ERROR!");
		const value = expr();
		if (pos !== tokens.length) throw new FormulaError("#ERROR!");
		if (!Number.isFinite(value)) throw new FormulaError("#VALOR!");
		// Quita el ruido de coma flotante (0,1 + 0,2 = 0,3).
		return Number(value.toPrecision(15));
	};

	for (const key of Object.keys(sheet.cells)) {
		const ref = parseCellRef(key);
		if (ref) resultOf(ref.col, ref.row);
	}
	return results;
}

export function emptySheet(name = "Hoja 1"): Sheet {
	return { id: newId(), name, rows: DEFAULT_ROWS, cols: DEFAULT_COLS, cells: {}, styles: {} };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
	return typeof value === "string" && HEX_COLOR.test(value);
}

const STYLE_FLAGS: StyleFlag[] = ["bold", "italic", "underline", "strike"];
const ALIGNS: CellAlign[] = ["left", "center", "right"];
const BORDER_SIDES = ["t", "r", "b", "l"] as const;

/** Tamaño válido distinto del normal; si no, `null`. */
function cleanFontSize(raw: unknown): number | null {
	if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
	const size = Math.round(raw);
	return size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE && size !== DEFAULT_FONT_SIZE ? size : null;
}

function cleanBorder(raw: unknown): CellBorder | null {
	if (!raw || typeof raw !== "object") return null;
	const border: CellBorder = {};
	for (const side of BORDER_SIDES) if ((raw as Record<string, unknown>)[side] === true) border[side] = true;
	return Object.keys(border).length > 0 ? border : null;
}

/** Deja solo lo válido de un formato (leído, pegado o armado); sin nada → `null`. */
export function cleanStyle(raw: unknown): CellStyle | null {
	if (!raw || typeof raw !== "object") return null;
	const { bg, color, size, align, border } = raw as Record<string, unknown>;
	const style: CellStyle = {};
	if (isHexColor(bg)) style.bg = bg.toLowerCase();
	if (isHexColor(color)) style.color = color.toLowerCase();
	for (const flag of STYLE_FLAGS) if ((raw as Record<string, unknown>)[flag] === true) style[flag] = true;
	const cleanSize = cleanFontSize(size);
	if (cleanSize !== null) style.size = cleanSize;
	if (ALIGNS.includes(align as CellAlign)) style.align = align as CellAlign;
	const cleanSides = cleanBorder(border);
	if (cleanSides) style.border = cleanSides;
	return Object.keys(style).length > 0 ? style : null;
}

function sameStyle(a: CellStyle | null | undefined, b: CellStyle | null | undefined): boolean {
	return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function reviveStyles(raw: unknown): Record<string, CellStyle> {
	const styles: Record<string, CellStyle> = {};
	if (!raw || typeof raw !== "object") return styles;
	for (const [key, value] of Object.entries(raw)) {
		if (!parseCellRef(key)) continue;
		const style = cleanStyle(value);
		if (style) styles[key.toUpperCase()] = style;
	}
	return styles;
}

export function emptyWorkbook(): Workbook {
	const sheet = emptySheet();
	return { version: 1, sheets: [sheet], activeSheetId: sheet.id };
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
	typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;

/** Valida lo leído del navegador; lo que no sirve se descarta. Basura → libro vacío. */
export function reviveWorkbook(raw: unknown): Workbook {
	if (!raw || typeof raw !== "object") return emptyWorkbook();
	const value = raw as Partial<Workbook>;
	if (value.version !== 1 || !Array.isArray(value.sheets)) return emptyWorkbook();
	const sheets: Sheet[] = [];
	for (const item of value.sheets) {
		if (!item || typeof item !== "object") continue;
		const s = item as Partial<Sheet>;
		const cells: Record<string, string> = {};
		if (s.cells && typeof s.cells === "object") {
			for (const [key, text] of Object.entries(s.cells)) {
				if (typeof text === "string" && text !== "" && parseCellRef(key)) cells[key.toUpperCase()] = text;
			}
		}
		sheets.push({
			id: typeof s.id === "string" && s.id ? s.id : newId(),
			name: typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, MAX_SHEET_NAME) : `Hoja ${sheets.length + 1}`,
			rows: clampInt(s.rows, 1, MAX_ROWS, DEFAULT_ROWS),
			cols: clampInt(s.cols, 1, MAX_COLS, DEFAULT_COLS),
			cells,
			styles: reviveStyles(s.styles),
		});
	}
	if (sheets.length === 0) return emptyWorkbook();
	const activeSheetId = sheets.some((s) => s.id === value.activeSheetId) ? (value.activeSheetId as string) : sheets[0].id;
	return { version: 1, sheets, activeSheetId };
}

export function activeSheet(book: Workbook): Sheet {
	return book.sheets.find((s) => s.id === book.activeSheetId) ?? book.sheets[0];
}

function updateSheet(book: Workbook, sheetId: string, change: (sheet: Sheet) => Sheet): Workbook {
	return { ...book, sheets: book.sheets.map((s) => (s.id === sheetId ? change(s) : s)) };
}

function findSheet(book: Workbook, sheetId: string): Sheet | undefined {
	return book.sheets.find((s) => s.id === sheetId);
}

/** Escribe en una celda; vacío la borra. Si queda igual, devuelve el mismo libro. */
export function setCell(book: Workbook, sheetId: string, key: string, raw: string): Workbook {
	const name = key.toUpperCase();
	const next = raw.trim() === "" ? "" : raw;
	if ((findSheet(book, sheetId)?.cells[name] ?? "") === next) return book;
	return updateSheet(book, sheetId, (sheet) => {
		const cells = { ...sheet.cells };
		if (next === "") delete cells[name];
		else cells[name] = next;
		return { ...sheet, cells };
	});
}

/**
 * Borra el contenido de varias celdas; el formato se queda (Supr), salvo con `withStyles`
 * (cortar). Si no había nada que borrar, devuelve el mismo libro.
 */
export function clearCells(book: Workbook, sheetId: string, keys: string[], { withStyles = false } = {}): Workbook {
	const sheet = findSheet(book, sheetId);
	if (!sheet) return book;
	const names = keys.map((k) => k.toUpperCase());
	const hasSomething = names.some((k) => k in sheet.cells || (withStyles && k in sheet.styles));
	if (!hasSomething) return book;
	return updateSheet(book, sheetId, (s) => {
		const cells = { ...s.cells };
		const styles = withStyles ? { ...s.styles } : s.styles;
		for (const key of names) {
			delete cells[key];
			if (withStyles) delete styles[key];
		}
		return { ...s, cells, styles };
	});
}

/** Aplica un cambio de formato a un estilo; un valor que no sirve deja lo que había. */
function patchStyle(current: CellStyle | undefined, patch: StylePatch): CellStyle | null {
	const next: Record<string, unknown> = { ...current };
	for (const [prop, value] of Object.entries(patch)) {
		if (value === undefined) continue;
		if (value === null || value === false || (prop === "size" && value === DEFAULT_FONT_SIZE)) {
			delete next[prop];
			continue;
		}
		const valid = cleanStyle({ [prop]: value }) as Record<string, unknown> | null;
		if (valid && prop in valid) next[prop] = valid[prop];
	}
	return cleanStyle(next);
}

/**
 * Da formato a varias celdas (ver `StylePatch`). Una celda sin formato sale de `styles`. Si nada
 * cambia, devuelve el mismo libro.
 */
export function setStyle(book: Workbook, sheetId: string, keys: string[], patch: StylePatch): Workbook {
	const sheet = findSheet(book, sheetId);
	if (!sheet) return book;
	const styles = { ...sheet.styles };
	let changed = false;
	for (const raw of keys) {
		const key = raw.toUpperCase();
		const next = patchStyle(styles[key], patch);
		if (sameStyle(next, cleanStyle(styles[key]))) continue;
		changed = true;
		if (next) styles[key] = next;
		else delete styles[key];
	}
	return changed ? updateSheet(book, sheetId, (s) => ({ ...s, styles })) : book;
}

/** Bordes como los del menú de Excel. */
export type BorderMode = "all" | "outer" | "top" | "bottom" | "left" | "right" | "none";

/**
 * Pone o quita bordes en los bloques marcados. `outer`, `top`, `bottom`, `left` y `right` van por el
 * borde de cada bloque; `none` quita los de las celdas y también el lado que la vecina comparte con
 * el bloque, para que la línea deje de verse.
 */
export function applyBorders(book: Workbook, sheetId: string, ranges: CellRange[], mode: BorderMode): Workbook {
	const sheet = findSheet(book, sheetId);
	if (!sheet) return book;
	const styles = { ...sheet.styles };
	let changed = false;
	const edit = (col: number, row: number, change: (border: CellBorder) => void) => {
		if (col < 0 || row < 0 || col >= sheet.cols || row >= sheet.rows) return;
		const key = cellKey(col, row);
		const border: CellBorder = { ...styles[key]?.border };
		change(border);
		const next = cleanStyle({ ...styles[key], border });
		if (sameStyle(next, styles[key])) return;
		changed = true;
		if (next) styles[key] = next;
		else delete styles[key];
	};
	for (const range of ranges) {
		const r = { c0: Math.max(0, range.c0), r0: Math.max(0, range.r0), c1: Math.min(range.c1, sheet.cols - 1), r1: Math.min(range.r1, sheet.rows - 1) };
		for (let row = r.r0; row <= r.r1; row += 1) {
			for (let col = r.c0; col <= r.c1; col += 1) {
				edit(col, row, (b) => {
					if (mode === "none") {
						for (const side of BORDER_SIDES) delete b[side];
						return;
					}
					const all = mode === "all";
					const outer = mode === "outer";
					if (all || ((outer || mode === "top") && row === r.r0)) b.t = true;
					if (all || ((outer || mode === "bottom") && row === r.r1)) b.b = true;
					if (all || ((outer || mode === "left") && col === r.c0)) b.l = true;
					if (all || ((outer || mode === "right") && col === r.c1)) b.r = true;
				});
			}
		}
		if (mode === "none") {
			for (let col = r.c0; col <= r.c1; col += 1) {
				edit(col, r.r0 - 1, (b) => delete b.b);
				edit(col, r.r1 + 1, (b) => delete b.t);
			}
			for (let row = r.r0; row <= r.r1; row += 1) {
				edit(r.c0 - 1, row, (b) => delete b.r);
				edit(r.c1 + 1, row, (b) => delete b.l);
			}
		}
	}
	return changed ? updateSheet(book, sheetId, (s) => ({ ...s, styles })) : book;
}

/** Celdas dentro de una fórmula; el carácter de antes va aparte para no tomar trozos de nombres. */
const FORMULA_REF = /(^|[^A-Za-z0-9_$])(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(])/g;

/**
 * Corre las celdas de una fórmula copiada `dc` columnas y `dr` filas, como Excel: `=A2+B2` una fila
 * más abajo queda `=A3+B3`; con `$` (`$A$2`) no se mueve. Si sale de la hoja queda `#REF!`. Lo que
 * no es fórmula vuelve tal cual.
 */
export function shiftFormula(raw: string, dc: number, dr: number): string {
	if ((dc === 0 && dr === 0) || !raw.trimStart().startsWith("=")) return raw;
	return raw.replace(FORMULA_REF, (_match, before: string, colFixed: string, letters: string, rowFixed: string, digits: string) => {
		const col = columnIndex(letters) + (colFixed ? 0 : dc);
		const row = Number(digits) - 1 + (rowFixed ? 0 : dr);
		if (col < 0 || row < 0) return `${before}#REF!`;
		return `${before}${colFixed}${columnLabel(col)}${rowFixed}${row + 1}`;
	});
}

/** Una celda copiada o por pegar: lo escrito y su formato. */
export type ClipCell = { raw: string; style?: CellStyle | null };

export type ClipBlock = {
	/** Filas × columnas, todas del mismo largo. */
	cells: ClipCell[][];
	/** Reemplaza el formato de destino; `false` (texto sin formato) deja el que había. */
	withStyles: boolean;
	/** Celda de arriba a la izquierda del origen, si se copió de una hoja de aquí: corre las fórmulas. */
	from?: Pos;
};

/**
 * Pega un bloque en un solo cambio. Va desde la esquina de arriba a la izquierda del último bloque
 * marcado; si se copió una sola celda y hay varias marcadas, las llena todas (como Excel). La hoja
 * crece si hace falta, hasta el máximo; lo que no cabe queda fuera (`clipped`). Devuelve también lo
 * pegado, para marcarlo.
 */
export function pasteBlock(
	book: Workbook,
	sheetId: string,
	targets: CellRange[],
	block: ClipBlock,
): { book: Workbook; range: CellRange; clipped: boolean } {
	const sheet = findSheet(book, sheetId);
	const last = targets[targets.length - 1];
	const height = block.cells.length;
	const width = block.cells[0]?.length ?? 0;
	if (!sheet || !last || height === 0 || width === 0) {
		return { book, range: last ?? { c0: 0, r0: 0, c1: 0, r1: 0 }, clipped: false };
	}
	const cells = { ...sheet.cells };
	const styles = block.withStyles ? { ...sheet.styles } : sheet.styles;
	const put = (col: number, row: number, clip: ClipCell, source: Pos | undefined) => {
		const key = cellKey(col, row);
		const raw = source ? shiftFormula(clip.raw, col - source.col, row - source.row) : clip.raw;
		if (raw.trim() === "") delete cells[key];
		else cells[key] = raw;
		if (block.withStyles) {
			const style = cleanStyle(clip.style);
			if (style) styles[key] = style;
			else delete styles[key];
		}
	};

	let rows = sheet.rows;
	let cols = sheet.cols;
	let range: CellRange;
	let clipped = false;
	const keys = keysInRanges(targets, sheet);
	if (height === 1 && width === 1 && keys.length > 1) {
		for (const key of keys) {
			const pos = parseCellRef(key);
			if (pos) put(pos.col, pos.row, block.cells[0][0], block.from);
		}
		range = { c0: last.c0, r0: last.r0, c1: Math.min(last.c1, sheet.cols - 1), r1: Math.min(last.r1, sheet.rows - 1) };
	} else {
		const at = { col: last.c0, row: last.r0 };
		rows = Math.min(MAX_ROWS, Math.max(rows, at.row + height));
		cols = Math.min(MAX_COLS, Math.max(cols, at.col + width));
		clipped = at.row + height > rows || at.col + width > cols;
		const r1 = Math.min(at.row + height, rows) - 1;
		const c1 = Math.min(at.col + width, cols) - 1;
		for (let row = at.row; row <= r1; row += 1) {
			for (let col = at.col; col <= c1; col += 1) {
				const dr = row - at.row;
				const dc = col - at.col;
				const source = block.from ? { col: block.from.col + dc, row: block.from.row + dr } : undefined;
				put(col, row, block.cells[dr][dc], source);
			}
		}
		range = { c0: at.col, r0: at.row, c1, r1 };
	}
	return {
		book: updateSheet(book, sheetId, (s) => ({ ...s, rows, cols, cells, styles })),
		range,
		clipped,
	};
}

/**
 * Recorta un bloque hasta la última fila y columna con algo (contenido o formato), para que copiar
 * una columna entera no lleve mil filas vacías. Nunca queda más chico que su primera celda.
 */
export function trimToUsed(sheet: Sheet, range: CellRange): CellRange {
	let lastRow = range.r0;
	let lastCol = range.c0;
	for (const key of [...Object.keys(sheet.cells), ...Object.keys(sheet.styles)]) {
		const ref = parseCellRef(key);
		if (!ref || ref.col < range.c0 || ref.col > range.c1 || ref.row < range.r0 || ref.row > range.r1) continue;
		lastRow = Math.max(lastRow, ref.row);
		lastCol = Math.max(lastCol, ref.col);
	}
	return { ...range, r1: lastRow, c1: lastCol };
}

/** Lo escrito y el formato de un bloque (dentro de la hoja), para copiar. */
export function blockFromSheet(sheet: Sheet, range: CellRange): ClipCell[][] {
	const out: ClipCell[][] = [];
	for (let row = range.r0; row <= Math.min(range.r1, sheet.rows - 1); row += 1) {
		const line: ClipCell[] = [];
		for (let col = range.c0; col <= Math.min(range.c1, sheet.cols - 1); col += 1) {
			const key = cellKey(col, row);
			line.push({ raw: sheet.cells[key] ?? "", style: sheet.styles[key] ?? null });
		}
		out.push(line);
	}
	return out;
}

export function rangeFrom(a: { col: number; row: number }, b: { col: number; row: number }): CellRange {
	return { c0: Math.min(a.col, b.col), r0: Math.min(a.row, b.row), c1: Math.max(a.col, b.col), r1: Math.max(a.row, b.row) };
}

/** Columnas enteras de `fromCol` a `toCol`. */
export function columnRange(sheet: Sheet, fromCol: number, toCol = fromCol): CellRange {
	return { c0: Math.min(fromCol, toCol), r0: 0, c1: Math.max(fromCol, toCol), r1: sheet.rows - 1 };
}

/** Filas enteras de `fromRow` a `toRow`. */
export function rowRange(sheet: Sheet, fromRow: number, toRow = fromRow): CellRange {
	return { c0: 0, r0: Math.min(fromRow, toRow), c1: sheet.cols - 1, r1: Math.max(fromRow, toRow) };
}

export function sheetRange(sheet: Sheet): CellRange {
	return { c0: 0, r0: 0, c1: sheet.cols - 1, r1: sheet.rows - 1 };
}

export function inRanges(ranges: CellRange[], col: number, row: number): boolean {
	return ranges.some((r) => col >= r.c0 && col <= r.c1 && row >= r.r0 && row <= r.r1);
}

/** `"B2:D5"`, o `"B2"` si es una sola celda. */
export function rangeLabel(range: CellRange): string {
	const start = cellKey(range.c0, range.r0);
	return range.c0 === range.c1 && range.r0 === range.r1 ? start : `${start}:${cellKey(range.c1, range.r1)}`;
}

export type Pos = { col: number; row: number };

/** `cell`: bloque de celdas; `col` / `row`: columnas o filas enteras (clic en el encabezado). */
export type SelectionKind = "cell" | "col" | "row";

/**
 * Lo marcado. `anchor` es la celda activa (la que se edita al escribir); `focus`, la punta que
 * se mueve con Shift o al arrastrar. El último rango siempre va de `anchor` a `focus`; los
 * anteriores son los que se sumaron con Ctrl.
 */
export type Selection = { anchor: Pos; focus: Pos; kind: SelectionKind; ranges: CellRange[] };

function spanOf(sheet: Sheet, kind: SelectionKind, anchor: Pos, focus: Pos): CellRange {
	if (kind === "col") return columnRange(sheet, anchor.col, focus.col);
	if (kind === "row") return rowRange(sheet, anchor.row, focus.row);
	return rangeFrom(anchor, focus);
}

/** Marca solo `pos` (o su columna o fila entera). */
export function selectAt(sheet: Sheet, pos: Pos, kind: SelectionKind = "cell"): Selection {
	return { anchor: pos, focus: pos, kind, ranges: [spanOf(sheet, kind, pos, pos)] };
}

/** Shift: estira el último rango desde la celda activa hasta `focus`. */
export function extendSelection(sheet: Sheet, sel: Selection, focus: Pos, kind: SelectionKind = sel.kind): Selection {
	return { ...sel, focus, kind, ranges: [...sel.ranges.slice(0, -1), spanOf(sheet, kind, sel.anchor, focus)] };
}

/** Ctrl: suma `pos` como un rango nuevo, que pasa a ser el activo. */
export function addToSelection(sheet: Sheet, sel: Selection, pos: Pos, kind: SelectionKind = "cell"): Selection {
	return { anchor: pos, focus: pos, kind, ranges: [...sel.ranges, spanOf(sheet, kind, pos, pos)] };
}

export function selectAll(sheet: Sheet): Selection {
	return extendSelection(sheet, selectAt(sheet, { col: 0, row: 0 }), { col: sheet.cols - 1, row: sheet.rows - 1 });
}

/** Más de una celda marcada. */
export function isMultiSelection(sel: Selection): boolean {
	if (sel.ranges.length > 1) return true;
	const r = sel.ranges[0];
	return Boolean(r) && (r.c0 !== r.c1 || r.r0 !== r.r1);
}

/** Nombres de las celdas marcadas, sin repetir y solo las que están dentro de la hoja. */
export function keysInRanges(ranges: CellRange[], sheet: Sheet): string[] {
	const keys = new Set<string>();
	for (const r of ranges) {
		const c1 = Math.min(r.c1, sheet.cols - 1);
		const r1 = Math.min(r.r1, sheet.rows - 1);
		for (let row = Math.max(0, r.r0); row <= r1; row += 1) {
			for (let col = Math.max(0, r.c0); col <= c1; col += 1) keys.add(cellKey(col, row));
		}
	}
	return [...keys];
}

/** Agrega filas o columnas, sin pasar del máximo. */
export function growSheet(book: Workbook, sheetId: string, add: { rows?: number; cols?: number }): Workbook {
	return updateSheet(book, sheetId, (sheet) => ({
		...sheet,
		rows: Math.min(MAX_ROWS, sheet.rows + (add.rows ?? 0)),
		cols: Math.min(MAX_COLS, sheet.cols + (add.cols ?? 0)),
	}));
}

/** Agrega «Hoja N» (el primer número libre) y la deja abierta. */
export function addSheet(book: Workbook): Workbook {
	const taken = new Set(book.sheets.map((s) => s.name.toLowerCase()));
	let n = book.sheets.length + 1;
	while (taken.has(`hoja ${n}`)) n += 1;
	const sheet = emptySheet(`Hoja ${n}`);
	return { ...book, sheets: [...book.sheets, sheet], activeSheetId: sheet.id };
}

/** Cambia el nombre; vacío o repetido (sin importar mayúsculas) no cambia nada. */
export function renameSheet(book: Workbook, sheetId: string, name: string): Workbook {
	const clean = name.trim().slice(0, MAX_SHEET_NAME);
	if (!clean) return book;
	if (book.sheets.some((s) => s.id !== sheetId && s.name.toLowerCase() === clean.toLowerCase())) return book;
	return updateSheet(book, sheetId, (sheet) => ({ ...sheet, name: clean }));
}

/** Borra una hoja; la última no se puede borrar. Si era la abierta, abre la de al lado. */
export function removeSheet(book: Workbook, sheetId: string): Workbook {
	if (book.sheets.length <= 1) return book;
	const index = book.sheets.findIndex((s) => s.id === sheetId);
	if (index < 0) return book;
	const sheets = book.sheets.filter((s) => s.id !== sheetId);
	const activeSheetId = book.activeSheetId === sheetId ? sheets[Math.max(0, index - 1)].id : book.activeSheetId;
	return { ...book, sheets, activeSheetId };
}

/**
 * CSV de la hoja con los resultados (separado por `;` y con coma decimal, para que Excel en
 * español lo abra en columnas). Solo hasta la última fila y columna con algo escrito.
 */
export function sheetCsv(sheet: Sheet, results: Map<string, CellResult>): string {
	let lastRow = -1;
	let lastCol = -1;
	for (const key of Object.keys(sheet.cells)) {
		const ref = parseCellRef(key);
		if (!ref) continue;
		lastRow = Math.max(lastRow, ref.row);
		lastCol = Math.max(lastCol, ref.col);
	}
	const field = (r: CellResult | undefined) => {
		if (!r) return "";
		if (r.error) return r.error;
		if (r.value === null) return "";
		const s = typeof r.value === "number" ? String(r.value).replace(".", ",") : r.value;
		return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const lines: string[] = [];
	for (let row = 0; row <= lastRow; row += 1) {
		const line: string[] = [];
		for (let col = 0; col <= lastCol; col += 1) line.push(field(results.get(cellKey(col, row))));
		lines.push(line.join(";"));
	}
	return lines.join("\n");
}
