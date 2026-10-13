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
	/** Colores por celda. Van aparte del contenido: borrar una celda deja su color, como en Excel. */
	styles: Record<string, CellStyle>;
};

/** Relleno y color de letra, como `#rrggbb`. */
export type CellStyle = { bg?: string; color?: string };

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
function literalValue(raw: string): number | string | null {
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

function reviveStyles(raw: unknown): Record<string, CellStyle> {
	const styles: Record<string, CellStyle> = {};
	if (!raw || typeof raw !== "object") return styles;
	for (const [key, value] of Object.entries(raw)) {
		if (!parseCellRef(key) || !value || typeof value !== "object") continue;
		const { bg, color } = value as CellStyle;
		const style: CellStyle = {};
		if (isHexColor(bg)) style.bg = bg.toLowerCase();
		if (isHexColor(color)) style.color = color.toLowerCase();
		if (style.bg || style.color) styles[key.toUpperCase()] = style;
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

/** Escribe en una celda; vacío la borra. */
export function setCell(book: Workbook, sheetId: string, key: string, raw: string): Workbook {
	const name = key.toUpperCase();
	return updateSheet(book, sheetId, (sheet) => {
		const cells = { ...sheet.cells };
		if (raw.trim() === "") delete cells[name];
		else cells[name] = raw;
		return { ...sheet, cells };
	});
}

/** Borra el contenido de varias celdas; los colores se quedan. */
export function clearCells(book: Workbook, sheetId: string, keys: string[]): Workbook {
	return updateSheet(book, sheetId, (sheet) => {
		const cells = { ...sheet.cells };
		for (const key of keys) delete cells[key.toUpperCase()];
		return { ...sheet, cells };
	});
}

/**
 * Pinta varias celdas. `bg` o `color` en `null` quitan ese color; si no se pasan, quedan como
 * estaban. Una celda sin colores sale de `styles`.
 */
export function setStyle(
	book: Workbook,
	sheetId: string,
	keys: string[],
	patch: { bg?: string | null; color?: string | null },
): Workbook {
	return updateSheet(book, sheetId, (sheet) => {
		const styles = { ...sheet.styles };
		for (const raw of keys) {
			const key = raw.toUpperCase();
			const next: CellStyle = { ...styles[key] };
			for (const prop of ["bg", "color"] as const) {
				const value = patch[prop];
				if (value === null) delete next[prop];
				else if (isHexColor(value)) next[prop] = value.toLowerCase();
			}
			if (next.bg || next.color) styles[key] = next;
			else delete styles[key];
		}
		return { ...sheet, styles };
	});
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
