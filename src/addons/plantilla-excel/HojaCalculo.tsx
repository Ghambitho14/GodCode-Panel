import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type ClipboardEvent,
	type CSSProperties,
	type Dispatch,
	type KeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	type RefObject,
	type SetStateAction,
} from "react";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Baseline,
	Bold,
	Download,
	Italic,
	PaintBucket,
	Plus,
	Redo2,
	Strikethrough,
	Underline,
	Undo2,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";

import BordesMenu from "./BordesMenu";
import ColorMenu from "./ColorMenu";
import { FILL_COLORS, TEXT_COLORS, TEXT_ON_FILL } from "./colores";
import {
	activeSheet,
	addSheet,
	addToSelection,
	applyBorders,
	blockFromSheet,
	cellKey,
	clearCells,
	columnLabel,
	DEFAULT_FONT_SIZE,
	evaluateSheet,
	extendSelection,
	FONT_SIZES,
	growSheet,
	isMultiSelection,
	keysInRanges,
	MAX_COLS,
	MAX_ROWS,
	parseCellRef,
	pasteBlock,
	rangeFrom,
	rangeLabel,
	removeSheet,
	renameSheet,
	reviveZoom,
	selectAll,
	selectAt,
	setCell,
	setStyle,
	sheetCsv,
	stepZoom,
	trimToUsed,
	ZOOM_STEPS,
	type BorderMode,
	type CellAlign,
	type CellRange,
	type CellResult,
	type CellStyle,
	type ClipBlock,
	type Pos,
	type Selection,
	type SelectionKind,
	type StyleFlag,
	type StylePatch,
	type Workbook,
} from "./hoja-calculo";
import { parseClipboardHtml, parseTsv, toHtml, toTsv } from "./portapapeles";
import "./HojaCalculo.css";

/** Cómo va el guardado (lo muestra la barra de arriba). */
export type SaveStatus = "saved" | "saving" | "offline" | "local";

export type HojaCalculoProps = {
	/** El libro; quien pinta la hoja decide dónde se guarda (`Screen.tsx`: en Supabase). */
	book: Workbook;
	onBookChange: Dispatch<SetStateAction<Workbook>>;
	saveStatus: SaveStatus;
	savedAt: Date | null;
	/** Dónde se recuerda el zoom en el navegador. */
	zoomKey: string;
	locale: string;
	branchName?: string | null;
};

/**
 * Celda en edición. `enter`: se empezó escribiendo (las flechas confirman y mueven, como en
 * Excel); `edit`: doble clic, F2 o la barra (las flechas mueven el cursor del texto).
 */
type Editing = Pos & { draft: string; mode: "enter" | "edit"; from: "cell" | "bar" };

/** Zoom de la hoja: es de quien la mira, así que va aparte y no dentro del libro. */
function useZoom(storageKey: string) {
	const [zoom, setZoom] = useState(() => {
		try {
			return reviveZoom(window.localStorage.getItem(storageKey));
		} catch {
			return 100;
		}
	});
	useEffect(() => {
		try {
			window.localStorage.setItem(storageKey, String(zoom));
		} catch {
			// Sin almacenamiento el zoom vale solo hasta recargar.
		}
	}, [storageKey, zoom]);
	return { zoom, setZoom };
}

const HISTORY_LIMIT = 100;

/**
 * Deshacer y rehacer: guarda el libro de antes de cada cambio (solo en memoria; se pierde al
 * recargar). Abrir otra hoja no cuenta como cambio.
 */
function useBookHistory(book: Workbook, setBook: Dispatch<SetStateAction<Workbook>>) {
	const bookRef = useRef(book);
	const past = useRef<Workbook[]>([]);
	const future = useRef<Workbook[]>([]);
	const [counts, setCounts] = useState({ past: 0, future: 0 });

	useLayoutEffect(() => {
		bookRef.current = book;
	}, [book]);

	const write = useCallback(
		(next: Workbook) => {
			bookRef.current = next;
			setBook(next);
			setCounts({ past: past.current.length, future: future.current.length });
		},
		[setBook],
	);

	/** Un cambio que se puede deshacer. */
	const change = useCallback(
		(fn: (b: Workbook) => Workbook) => {
			const prev = bookRef.current;
			const next = fn(prev);
			if (next === prev) return;
			past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), prev];
			future.current = [];
			write(next);
		},
		[write],
	);

	/** Un cambio que no entra al historial (abrir otra hoja). */
	const changeQuietly = useCallback(
		(fn: (b: Workbook) => Workbook) => {
			const next = fn(bookRef.current);
			if (next !== bookRef.current) write(next);
		},
		[write],
	);

	/** Vuelve un paso atrás o adelante; devuelve el libro que quedó (o `null` si no había). */
	const travel = (from: RefObject<Workbook[]>, to: RefObject<Workbook[]>): Workbook | null => {
		const target = from.current.at(-1);
		if (!target) return null;
		from.current = from.current.slice(0, -1);
		to.current = [...to.current, bookRef.current];
		write(target);
		return target;
	};

	return {
		change,
		changeQuietly,
		undo: () => travel(past, future),
		redo: () => travel(future, past),
		canUndo: counts.past > 0,
		canRedo: counts.future > 0,
	};
}

/** Lo último copiado desde una hoja de aquí: al pegarlo se usan sus fórmulas y su formato. */
let lastCopy: { text: string; block: ClipBlock } | null = null;

const normalizeClipText = (text: string) => text.replace(/\r\n?/g, "\n").replace(/\n$/, "");

/** Lo que trae el portapapeles, listo para pegar; nada útil → `null`. */
function blockFromClipboard(data: DataTransfer): ClipBlock | null {
	const text = data.getData("text/plain");
	if (lastCopy && text && normalizeClipText(text) === normalizeClipText(lastCopy.text)) return lastCopy.block;
	const values = parseTsv(text);
	if (values.length === 0) return null;
	const styles = parseClipboardHtml(data.getData("text/html"), values);
	return {
		// Las celdas son de una línea: un salto dentro de una celda de Excel queda como espacio.
		cells: values.map((row, r) => row.map((raw, c) => ({ raw: raw.replace(/\s*\n\s*/g, " "), style: styles?.[r]?.[c] ?? null }))),
		withStyles: styles !== null,
	};
}

/** Atajos de formato: Ctrl+B, Ctrl+I, Ctrl+U y Ctrl+5 (tachado, como en Excel). */
const FORMAT_KEYS: Record<string, StyleFlag> = { b: "bold", i: "italic", u: "underline", 5: "strike" };

function formatShortcut(event: KeyboardEvent): StyleFlag | undefined {
	if (!(event.ctrlKey || event.metaKey) || event.altKey) return undefined;
	return FORMAT_KEYS[event.key.toLowerCase()];
}

/** Al escribir una fórmula, tras `=`, un operador o `(`, un clic en otra celda pone su nombre. */
function isPointing(draft: string): boolean {
	return draft.trimStart().startsWith("=") && /[=+\-*/(;:,]\s*$/.test(draft);
}

/** Celda, letra o número bajo el puntero (para arrastrar). */
function posAt(x: number, y: number, kind: SelectionKind): Pos | null {
	const el = document.elementFromPoint(x, y);
	const cell = el?.closest<HTMLElement>("[data-cell]");
	const ref = cell?.dataset.cell ? parseCellRef(cell.dataset.cell) : null;
	if (kind === "col") {
		const head = el?.closest<HTMLElement>("[data-col]");
		const col = head ? Number(head.dataset.col) : ref?.col;
		return typeof col === "number" && Number.isFinite(col) ? { col, row: 0 } : null;
	}
	if (kind === "row") {
		const head = el?.closest<HTMLElement>("[data-row]");
		const row = head ? Number(head.dataset.row) : ref?.row;
		return typeof row === "number" && Number.isFinite(row) ? { col: 0, row } : null;
	}
	return ref;
}

const samePos = (a: Pos, b: Pos) => a.col === b.col && a.row === b.row;

type CellHandlers = {
	onCellMouseDown: (pos: Pos, event: ReactMouseEvent) => void;
	onRowHeadMouseDown: (row: number, event: ReactMouseEvent) => void;
	onCellDoubleClick: (pos: Pos) => void;
	onEditorChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onEditorKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	onEditorPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
	onEditorBlur: () => void;
};

type RowProps = {
	row: number;
	cols: number;
	results: Map<string, CellResult>;
	styles: Record<string, CellStyle>;
	/** Columna de la celda activa si está en esta fila; si no, -1. */
	activeCol: number;
	/** Tramos marcados de esta fila (`"0-3,5-5"`); vacío si no hay nada marcado. Texto para que `memo` compare fácil. */
	marked: string;
	editing: Editing | null;
	format: (value: number) => string;
	handlers: CellHandlers;
	editorRef: RefObject<HTMLInputElement | null>;
};

function parseSpans(marked: string): Array<[number, number]> {
	if (!marked) return [];
	return marked.split(",").map((part) => {
		const [a, b] = part.split("-").map(Number);
		return [a, b];
	});
}

/** Tamaño de letra de Excel → px de pantalla (el 11 normal son los 13 px de siempre). */
const fontPx = (size: number) => Math.round(((size * 13) / DEFAULT_FONT_SIZE) * 100) / 100;

function cellStyle(style: CellStyle | undefined, isError: boolean): CSSProperties | undefined {
	if (!style) return undefined;
	const color = style.color ?? (style.bg ? TEXT_ON_FILL : undefined);
	const decoration = [style.underline && "underline", style.strike && "line-through"].filter(Boolean).join(" ");
	return {
		backgroundColor: style.bg,
		color: isError ? undefined : color,
		fontWeight: style.bold ? 700 : undefined,
		fontStyle: style.italic ? "italic" : undefined,
		textDecorationLine: decoration || undefined,
		fontSize: style.size ? `calc(${fontPx(style.size)}px * var(--hoja-zoom, 1))` : undefined,
		textAlign: style.align,
	};
}

/**
 * Bordes de una celda como clases. Cada celda pinta su línea de la derecha y la de abajo (la de la
 * cuadrícula), también si la vecina pidió ese lado; la columna A y la fila 1 pintan además el de la
 * izquierda y el de arriba.
 */
function borderClasses(styles: Record<string, CellStyle>, key: string, col: number, row: number): string {
	const own = styles[key]?.border;
	const right = own?.r || styles[cellKey(col + 1, row)]?.border?.l;
	const bottom = own?.b || styles[cellKey(col, row + 1)]?.border?.t;
	return `${right ? " has-border-r" : ""}${bottom ? " has-border-b" : ""}${col === 0 && own?.l ? " has-border-l" : ""}${
		row === 0 && own?.t ? " has-border-t" : ""
	}`;
}

const SheetRow = memo(function SheetRow({
	row,
	cols,
	results,
	styles,
	activeCol,
	marked,
	editing,
	format,
	handlers,
	editorRef,
}: RowProps) {
	const spans = parseSpans(marked);
	const tds = Array.from({ length: cols }, (_, col) => {
		const key = cellKey(col, row);
		const result = results.get(key);
		const isEditing = editing !== null && editing.col === col;
		const inRange = spans.some(([c0, c1]) => col >= c0 && col <= c1);
		let text = "";
		let kind = "";
		if (isEditing) {
			text = editing.draft;
		} else if (result?.error) {
			text = result.error;
			kind = " is-error";
		} else if (typeof result?.value === "number") {
			text = format(result.value);
			kind = " is-number";
		} else if (typeof result?.value === "string") {
			text = result.value;
		}
		const style = cellStyle(styles[key], Boolean(result?.error) && !isEditing);
		return (
			<td
				key={key}
				data-cell={key}
				className={`hoja__cell${kind}${activeCol === col ? " is-selected" : ""}${inRange ? " is-in-range" : ""}${borderClasses(styles, key, col, row)}`}
				style={style}
				title={result?.error ? errorHelp[result.error] : undefined}
				onMouseDown={(event) => handlers.onCellMouseDown({ col, row }, event)}
				onDoubleClick={() => handlers.onCellDoubleClick({ col, row })}
			>
				{isEditing && editing.from === "cell" ? (
					<input
						ref={editorRef}
						className="hoja__editor"
						style={style}
						aria-label={`Celda ${key}`}
						value={editing.draft}
						spellCheck={false}
						autoComplete="off"
						onChange={handlers.onEditorChange}
						onKeyDown={handlers.onEditorKeyDown}
						onPaste={handlers.onEditorPaste}
						onBlur={handlers.onEditorBlur}
					/>
				) : (
					text
				)}
			</td>
		);
	});
	return (
		<tr>
			<th
				scope="row"
				data-row={row}
				className={`hoja__row-head${activeCol >= 0 || spans.length > 0 ? " is-active" : ""}`}
				onMouseDown={(event) => handlers.onRowHeadMouseDown(row, event)}
			>
				{row + 1}
			</th>
			{tds}
		</tr>
	);
});

const errorHelp: Record<string, string> = {
	"#DIV/0!": "División por cero",
	"#REF!": "La fórmula usa una celda que no existe en la hoja",
	"#CICLO!": "La celda se usa a sí misma (directa o indirectamente)",
	"#ERROR!": "Fórmula mal escrita. Se puede usar + - * /, paréntesis, celdas (B3) y SUMA(A1:A31)",
	"#VALOR!": "La cuenta usa una celda con texto",
};

/** Lo que hacen el mouse y el dedo sobre la hoja; se lee desde los listeners del documento. */
type PointerActions = {
	extendTo: (pos: Pos) => void;
	beginTouchSelect: (pos: Pos) => void;
};

const LONG_PRESS_MS = 500;
const NOTICE_MS = 5000;

function saveStatusText(status: SaveStatus, savedAt: Date | null, locale: string): string {
	if (status === "saving") return "Guardando…";
	if (status === "offline") return "Sin conexión: guardado en este navegador, se reintenta";
	if (status === "local") return "Se guarda en este navegador";
	if (!savedAt) return "Sin cambios";
	return `Guardado ${savedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
}

function numberFormatter(locale: string, options: Intl.NumberFormatOptions) {
	let nf: Intl.NumberFormat;
	try {
		nf = new Intl.NumberFormat(locale, options);
	} catch {
		nf = new Intl.NumberFormat("es", options);
	}
	return (value: number) => nf.format(value);
}

type ToolButtonProps = {
	label: string;
	/** Solo los botones que se prenden y apagan (negrita, alinear…). */
	pressed?: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
};

/** Botón de la barra de formato. No se lleva el foco: la celda que se edita o la hoja lo conservan. */
function ToolButton({ label, pressed, disabled, onClick, children }: ToolButtonProps) {
	return (
		<button
			type="button"
			className="hoja__tool"
			title={label}
			aria-label={label}
			aria-pressed={pressed}
			disabled={disabled}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

const ALIGN_BUTTONS: Array<{ align: CellAlign; label: string; icon: ReactNode }> = [
	{ align: "left", label: "Alinear a la izquierda", icon: <AlignLeft size={15} aria-hidden="true" /> },
	{ align: "center", label: "Centrar", icon: <AlignCenter size={15} aria-hidden="true" /> },
	{ align: "right", label: "Alinear a la derecha", icon: <AlignRight size={15} aria-hidden="true" /> },
];

const FLAG_BUTTONS: Array<{ flag: StyleFlag; label: string; icon: ReactNode }> = [
	{ flag: "bold", label: "Negrita (Ctrl+B)", icon: <Bold size={15} aria-hidden="true" /> },
	{ flag: "italic", label: "Cursiva (Ctrl+I)", icon: <Italic size={15} aria-hidden="true" /> },
	{ flag: "underline", label: "Subrayado (Ctrl+U)", icon: <Underline size={15} aria-hidden="true" /> },
	{ flag: "strike", label: "Tachado (Ctrl+5)", icon: <Strikethrough size={15} aria-hidden="true" /> },
];

export default function HojaCalculo({
	book,
	onBookChange,
	saveStatus,
	savedAt,
	zoomKey,
	locale,
	branchName,
}: HojaCalculoProps) {
	const sheet = activeSheet(book);
	const results = useMemo(() => evaluateSheet(sheet), [sheet]);
	const [sel, setSel] = useState<Selection>(() => selectAt(sheet, { col: 0, row: 0 }));
	const [editing, setEditingState] = useState<Editing | null>(null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const { zoom, setZoom } = useZoom(zoomKey);
	const { change, changeQuietly, undo, redo, canUndo, canRedo } = useBookHistory(book, onBookChange);

	// Copia sincrónica de la edición: el blur llega después de Esc o de confirmar, y no debe volver
	// a escribir lo que ya se canceló.
	const editRef = useRef<Editing | null>(null);
	const gridRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<HTMLInputElement>(null);
	const barRef = useRef<HTMLInputElement>(null);
	/** Arrastre con el mouse en curso (desde una celda, una letra o un número). */
	const dragRef = useRef<SelectionKind | null>(null);
	/** Tras seleccionar con el dedo, el navegador puede mandar un clic de mouse que no hay que tomar. */
	const ignoreMouseUntil = useRef(0);

	const setEditing = (next: Editing | null) => {
		editRef.current = next;
		setEditingState(next);
	};

	useEffect(() => {
		if (!notice) return undefined;
		const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
		return () => window.clearTimeout(timer);
	}, [notice]);

	const format = useMemo(() => numberFormatter(locale, { maximumFractionDigits: 4 }), [locale]);
	/** Números para copiar: sin separador de miles y con el decimal del idioma, como los lee Excel. */
	const plainNumber = useMemo(() => numberFormatter(locale, { useGrouping: false, maximumFractionDigits: 10 }), [locale]);

	const active = sel.anchor;
	const activeKey = cellKey(active.col, active.row);
	const rawAt = (pos: Pos) => sheet.cells[cellKey(pos.col, pos.row)] ?? "";

	const focusGrid = () => gridRef.current?.focus({ preventScroll: true });

	const startEdit = (pos: Pos, draft: string, mode: Editing["mode"], from: Editing["from"] = "cell") => {
		setEditing({ ...pos, draft, mode, from });
	};

	const commitEdit = () => {
		const current = editRef.current;
		if (!current) return;
		setEditing(null);
		const sheetId = sheet.id;
		change((b) => setCell(b, sheetId, cellKey(current.col, current.row), current.draft));
	};

	const cancelEdit = () => {
		setEditing(null);
		focusGrid();
	};

	const clamp = (pos: Pos): Pos => ({
		col: Math.min(sheet.cols - 1, Math.max(0, pos.col)),
		row: Math.min(sheet.rows - 1, Math.max(0, pos.row)),
	});

	/** Vuelve a una sola celda. */
	const moveTo = (pos: Pos) => setSel(selectAt(sheet, clamp(pos)));

	const moveBy = (dc: number, dr: number) => moveTo({ col: active.col + dc, row: active.row + dr });

	/** Shift+flecha o arrastre: mueve la punta de la selección. */
	const extendTo = (pos: Pos) => {
		const next = clamp(pos);
		setSel((s) => (samePos(s.focus, next) ? s : extendSelection(sheet, s, next)));
	};

	// La punta de la selección siempre a la vista (también sirve de auto-scroll al arrastrar). Con
	// columnas o filas enteras no: el encabezado ya se ve y saltar a la fila 1 molestaría.
	useEffect(() => {
		if (sel.kind !== "cell") return;
		const { col, row } = sel.focus;
		gridRef.current?.querySelector(`[data-cell="${cellKey(col, row)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}, [sel.focus, sel.kind, sheet.id]);

	// Al empezar a editar, el cursor va al final del texto.
	const editKey = editing ? `${editing.from}:${editing.col}:${editing.row}` : "";
	useLayoutEffect(() => {
		if (!editKey) return;
		const input = editKey.startsWith("bar") ? barRef.current : editorRef.current;
		if (!input) return;
		if (document.activeElement !== input) input.focus({ preventScroll: true });
		const end = input.value.length;
		input.setSelectionRange(end, end);
	}, [editKey]);

	const selectedKeys = () => keysInRanges(sel.ranges, sheet);
	const activeStyle = sheet.styles[activeKey];

	/** Da formato a lo marcado (o a las celdas que se pasen). */
	const paint = (patch: StylePatch, keys = selectedKeys()) => {
		const sheetId = sheet.id;
		change((b) => setStyle(b, sheetId, keys, patch));
	};

	/** Negrita, cursiva…: si la celda activa ya la tiene, se quita en todo lo marcado; si no, se pone. */
	const toggleFlag = (flag: StyleFlag) => paint({ [flag]: !activeStyle?.[flag] });

	const setBorders = (mode: BorderMode) => {
		const sheetId = sheet.id;
		const ranges = sel.ranges;
		change((b) => applyBorders(b, sheetId, ranges, mode));
	};

	/** Deshacer o rehacer; si cambió la hoja abierta o se achicó, la selección vuelve a una celda válida. */
	const stepHistory = (direction: "undo" | "redo") => {
		setEditing(null);
		const restored = direction === "undo" ? undo() : redo();
		if (!restored) return;
		const next = activeSheet(restored);
		setSel((current) => {
			if (next.id !== sheet.id) return selectAt(next, { col: 0, row: 0 });
			if (current.ranges.every((r) => r.c1 < next.cols && r.r1 < next.rows)) return current;
			return selectAt(next, { col: Math.min(current.anchor.col, next.cols - 1), row: Math.min(current.anchor.row, next.rows - 1) });
		});
	};

	/** Pega un bloque y marca lo pegado (salvo una celda que llenó lo que ya estaba marcado). */
	const pasteInto = (block: ClipBlock, targets: CellRange[]) => {
		const sheetId = sheet.id;
		const out: { range: CellRange | null; clipped: boolean } = { range: null, clipped: false };
		change((b) => {
			const result = pasteBlock(b, sheetId, targets, block);
			out.range = result.range;
			out.clipped = result.clipped;
			return result.book;
		});
		const single = block.cells.length === 1 && block.cells[0].length === 1;
		const range = out.range;
		if (range && !single) {
			setSel(extendSelection(sheet, selectAt(sheet, { col: range.c0, row: range.r0 }), { col: range.c1, row: range.r1 }));
		}
		if (out.clipped) setNotice(`Se pegó solo lo que cabe: hasta la fila ${MAX_ROWS} y la columna ${columnLabel(MAX_COLS - 1)}.`);
	};

	const plainText = (result: CellResult | undefined): string => {
		if (!result) return "";
		if (result.error) return result.error;
		if (result.value === null) return "";
		return typeof result.value === "number" ? plainNumber(result.value) : result.value;
	};

	/**
	 * Ctrl+C / Ctrl+X con la hoja enfocada: deja el último bloque marcado como texto (con los
	 * resultados) y como tabla HTML (con el formato), para pegarlo en Excel. Cortar lo borra de aquí.
	 */
	const copySelection = (event: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
		if (event.target !== event.currentTarget) return;
		const last = sel.ranges[sel.ranges.length - 1];
		if (!last) return;
		event.preventDefault();
		const whole = sel.kind !== "cell" || (last.c0 === 0 && last.r0 === 0 && last.c1 >= sheet.cols - 1 && last.r1 >= sheet.rows - 1);
		const range = whole ? trimToUsed(sheet, last) : last;
		const cells = blockFromSheet(sheet, range);
		const values = cells.map((line, r) => line.map((_, c) => plainText(results.get(cellKey(range.c0 + c, range.r0 + r)))));
		const text = toTsv(values);
		event.clipboardData.setData("text/plain", text);
		event.clipboardData.setData("text/html", toHtml(values, cells.map((line) => line.map((cell) => cell.style))));
		lastCopy = { text, block: { cells, withStyles: true, from: cut ? undefined : { col: range.c0, row: range.r0 } } };
		if (sel.ranges.length > 1) setNotice("Se copió solo el último bloque marcado.");
		if (cut) {
			const sheetId = sheet.id;
			const keys = keysInRanges([range], sheet);
			change((b) => clearCells(b, sheetId, keys, { withStyles: true }));
		}
	};

	/** Ctrl+V con la hoja enfocada: pega desde la celda activa (o llena lo marcado con una sola celda). */
	const onGridPaste = (event: ClipboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		const block = blockFromClipboard(event.clipboardData);
		if (!block) return;
		event.preventDefault();
		pasteInto(block, sel.ranges);
	};

	/** Teclas de la hoja cuando no se está editando. */
	const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		const { key, shiftKey } = event;
		const mod = event.ctrlKey || event.metaKey;
		const lower = key.toLowerCase();
		const flag = formatShortcut(event);
		const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
		let handled = true;
		if (arrows[key] && shiftKey) extendTo({ col: sel.focus.col + arrows[key][0], row: sel.focus.row + arrows[key][1] });
		else if (arrows[key]) moveBy(arrows[key][0], arrows[key][1]);
		else if (mod && lower === "a") setSel(selectAll(sheet));
		else if (mod && !event.altKey && lower === "z") stepHistory(shiftKey ? "redo" : "undo");
		else if (mod && !event.altKey && lower === "y") stepHistory("redo");
		else if (flag) toggleFlag(flag);
		else if (key === "Enter") moveBy(0, shiftKey ? -1 : 1);
		else if (key === "Tab") moveBy(shiftKey ? -1 : 1, 0);
		else if (key === "F2") startEdit(active, rawAt(active), "edit");
		else if (key === "Delete" || key === "Backspace") {
			const sheetId = sheet.id;
			const keys = selectedKeys();
			change((b) => clearCells(b, sheetId, keys));
		} else if (key.length === 1 && !mod && !event.altKey) startEdit(active, key, "enter");
		else handled = false;
		if (handled) event.preventDefault();
	};

	/** Teclas mientras se edita (en la celda o en la barra). */
	const onEditorKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		const current = editRef.current;
		if (!current) return;
		const { key, shiftKey } = event;
		const at = { col: current.col, row: current.row };
		const flag = formatShortcut(event);
		if (flag) {
			// El formato es de toda la celda: se ve mientras se escribe.
			event.preventDefault();
			const target = cellKey(at.col, at.row);
			paint({ [flag]: !sheet.styles[target]?.[flag] }, [target]);
			return;
		}
		let next: Pos | null = null;
		if (key === "Enter") next = { col: at.col, row: at.row + (shiftKey ? -1 : 1) };
		else if (key === "Tab") next = { col: at.col + (shiftKey ? -1 : 1), row: at.row };
		else if (current.mode === "enter" && current.from === "cell") {
			if (key === "ArrowUp") next = { col: at.col, row: at.row - 1 };
			else if (key === "ArrowDown") next = { col: at.col, row: at.row + 1 };
			else if (key === "ArrowLeft") next = { col: at.col - 1, row: at.row };
			else if (key === "ArrowRight") next = { col: at.col + 1, row: at.row };
		}
		if (key === "Escape") {
			event.preventDefault();
			cancelEdit();
			return;
		}
		if (!next) return;
		event.preventDefault();
		commitEdit();
		moveTo(next);
		focusGrid();
	};

	/**
	 * Pegar mientras se edita: un solo valor entra donde está el cursor (lo hace el navegador); varias
	 * celdas cancelan la edición y se pegan como bloque desde esta celda.
	 */
	const onEditorPaste = (event: ClipboardEvent<HTMLInputElement>) => {
		const current = editRef.current;
		if (!current) return;
		const values = parseTsv(event.clipboardData.getData("text/plain"));
		if (values.length <= 1 && (values[0]?.length ?? 0) <= 1) return;
		const block = blockFromClipboard(event.clipboardData);
		if (!block) return;
		event.preventDefault();
		setEditing(null);
		const at = { col: current.col, row: current.row };
		pasteInto(block, [rangeFrom(at, at)]);
		focusGrid();
	};

	/** Clic en una celda, letra o número: solo, con Shift (estira) o con Ctrl/Cmd (suma). */
	const pick = (pos: Pos, kind: SelectionKind, event: ReactMouseEvent) => {
		if (event.shiftKey) setSel((s) => extendSelection(sheet, s, pos, kind));
		else if (event.ctrlKey || event.metaKey) setSel((s) => addToSelection(sheet, s, pos, kind));
		else setSel(selectAt(sheet, pos, kind));
		dragRef.current = kind;
	};

	const onHeadMouseDown = (pos: Pos, kind: SelectionKind, event: ReactMouseEvent) => {
		if (event.button !== 0 || Date.now() < ignoreMouseUntil.current) return;
		event.preventDefault();
		commitEdit();
		pick(pos, kind, event);
		focusGrid();
	};

	// Las filas están memorizadas: les paso funciones estables que leen las de este render.
	const latest = useRef<(CellHandlers & PointerActions) | null>(null);
	useLayoutEffect(() => {
		latest.current = {
			onCellMouseDown: (pos, event) => {
				if (event.button !== 0 || Date.now() < ignoreMouseUntil.current) return;
				const current = editRef.current;
				const same = current !== null && current.col === pos.col && current.row === pos.row;
				if (same && current.from === "cell") return;
				if (current && !same && isPointing(current.draft)) {
					event.preventDefault();
					setEditing({ ...current, draft: current.draft + cellKey(pos.col, pos.row) });
					return;
				}
				event.preventDefault();
				commitEdit();
				pick(pos, "cell", event);
				focusGrid();
			},
			onRowHeadMouseDown: (row, event) => onHeadMouseDown({ col: 0, row }, "row", event),
			onCellDoubleClick: (pos) => startEdit(pos, sheet.cells[cellKey(pos.col, pos.row)] ?? "", "edit"),
			onEditorChange: (event) => {
				const current = editRef.current;
				if (current) setEditing({ ...current, draft: event.target.value });
			},
			onEditorKeyDown,
			onEditorPaste,
			onEditorBlur: () => {
				if (editRef.current?.from === "cell") commitEdit();
			},
			extendTo,
			beginTouchSelect: (pos) => {
				commitEdit();
				setSel(selectAt(sheet, pos));
				focusGrid();
			},
		};
	});
	const handlers = useMemo<CellHandlers>(
		() => ({
			onCellMouseDown: (pos, event) => latest.current?.onCellMouseDown(pos, event),
			onRowHeadMouseDown: (row, event) => latest.current?.onRowHeadMouseDown(row, event),
			onCellDoubleClick: (pos) => latest.current?.onCellDoubleClick(pos),
			onEditorChange: (event) => latest.current?.onEditorChange(event),
			onEditorKeyDown: (event) => latest.current?.onEditorKeyDown(event),
			onEditorPaste: (event) => latest.current?.onEditorPaste(event),
			onEditorBlur: () => latest.current?.onEditorBlur(),
		}),
		[],
	);

	// Arrastrar con el mouse: mientras el botón siga apretado, la punta sigue al puntero.
	useEffect(() => {
		const onMove = (event: MouseEvent) => {
			const kind = dragRef.current;
			if (!kind) return;
			if (!(event.buttons & 1)) {
				dragRef.current = null;
				return;
			}
			const pos = posAt(event.clientX, event.clientY, kind);
			if (pos) latest.current?.extendTo(pos);
		};
		const onUp = () => {
			dragRef.current = null;
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

	// En el celular: mantener apretado medio segundo y arrastrar marca un bloque. Un toque rápido
	// elige (lo hace el clic que manda el navegador) y deslizar sin esperar mueve la hoja.
	useEffect(() => {
		const grid = gridRef.current;
		if (!grid) return undefined;
		let timer = 0;
		let start: { x: number; y: number } | null = null;
		let selecting = false;
		const stopTimer = () => {
			window.clearTimeout(timer);
			timer = 0;
		};
		const onTouchStart = (event: TouchEvent) => {
			stopTimer();
			if (event.touches.length !== 1) return;
			const touch = event.touches[0];
			const pos = posAt(touch.clientX, touch.clientY, "cell");
			if (!pos) return;
			start = { x: touch.clientX, y: touch.clientY };
			timer = window.setTimeout(() => {
				timer = 0;
				selecting = true;
				latest.current?.beginTouchSelect(pos);
				navigator.vibrate?.(10);
			}, LONG_PRESS_MS);
		};
		const onTouchMove = (event: TouchEvent) => {
			const touch = event.touches[0];
			if (!touch) return;
			if (selecting) {
				event.preventDefault();
				const pos = posAt(touch.clientX, touch.clientY, "cell");
				if (pos) latest.current?.extendTo(pos);
				return;
			}
			if (timer && start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 8) stopTimer();
		};
		const onTouchEnd = () => {
			stopTimer();
			if (selecting) ignoreMouseUntil.current = Date.now() + 800;
			selecting = false;
		};
		const onContextMenu = (event: Event) => {
			if (selecting || Date.now() < ignoreMouseUntil.current) event.preventDefault();
		};
		grid.addEventListener("touchstart", onTouchStart, { passive: true });
		grid.addEventListener("touchmove", onTouchMove, { passive: false });
		grid.addEventListener("touchend", onTouchEnd);
		grid.addEventListener("touchcancel", onTouchEnd);
		grid.addEventListener("contextmenu", onContextMenu);
		return () => {
			stopTimer();
			grid.removeEventListener("touchstart", onTouchStart);
			grid.removeEventListener("touchmove", onTouchMove);
			grid.removeEventListener("touchend", onTouchEnd);
			grid.removeEventListener("touchcancel", onTouchEnd);
			grid.removeEventListener("contextmenu", onContextMenu);
		};
	}, []);

	const resetSelection = () => setSel(selectAt(sheet, { col: 0, row: 0 }));

	const openSheet = (id: string) => {
		if (id === sheet.id) return;
		commitEdit();
		changeQuietly((b) => ({ ...b, activeSheetId: id }));
		resetSelection();
	};

	const deleteSheet = (id: string, name: string) => {
		if (!window.confirm(`¿Borrar la hoja «${name}» y todo lo que tiene?`)) return;
		setEditing(null);
		change((b) => removeSheet(b, id));
		resetSelection();
	};

	const downloadCsv = () => {
		const blob = new Blob([`﻿${sheetCsv(sheet, results)}`], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${sheet.name.replace(/[\\/:*?"<>|]+/g, "-") || "hoja"}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const multi = isMultiSelection(sel);
	const lastRange = sel.ranges[sel.ranges.length - 1];
	const nameLabel = editing
		? cellKey(editing.col, editing.row)
		: multi && lastRange
			? `${rangeLabel(lastRange)}${sel.ranges.length > 1 ? ` +${sel.ranges.length - 1}` : ""}`
			: activeKey;
	const activeSize = activeStyle?.size ?? DEFAULT_FONT_SIZE;
	const sizeOptions = FONT_SIZES.includes(activeSize) ? FONT_SIZES : [...FONT_SIZES, activeSize].sort((a, b) => a - b);
	const barEditing = editing !== null;
	const hasCells = Object.keys(sheet.cells).length > 0;
	const markedCols = new Set<number>();
	if (multi) {
		for (const r of sel.ranges) for (let c = r.c0; c <= Math.min(r.c1, sheet.cols - 1); c += 1) markedCols.add(c);
	}

	const colHeads = Array.from({ length: sheet.cols }, (_, col) => (
		<th
			key={col}
			scope="col"
			data-col={col}
			className={`hoja__col-head${col === active.col || markedCols.has(col) ? " is-active" : ""}`}
			onMouseDown={(event) => onHeadMouseDown({ col, row: 0 }, "col", event)}
		>
			{columnLabel(col)}
		</th>
	));
	const rows = [];
	for (let row = 0; row < sheet.rows; row += 1) {
		const editingHere = editing !== null && editing.row === row ? editing : null;
		const marked = multi
			? sel.ranges
					.filter((r) => row >= r.r0 && row <= r.r1)
					.map((r) => `${r.c0}-${r.c1}`)
					.join(",")
			: "";
		rows.push(
			<SheetRow
				key={row}
				row={row}
				cols={sheet.cols}
				results={results}
				styles={sheet.styles}
				activeCol={row === active.row ? active.col : -1}
				marked={marked}
				editing={editingHere}
				format={format}
				handlers={handlers}
				editorRef={editorRef}
			/>,
		);
	}

	return (
		<div className="hoja">
			<div className="hoja__toolbar">
				<div className="hoja__info">
					<span
						className={`hoja__status${saveStatus === "offline" ? " is-offline" : ""}`}
						role="status"
						title={saveStatus === "offline" ? "Los cambios quedan en este navegador y se suben solos al volver la conexión." : undefined}
					>
						{branchName ? `${branchName} · ` : ""}
						{saveStatusText(saveStatus, savedAt, locale)}
					</span>
					{notice ? (
						<span className="hoja__notice" role="status">
							{notice}
						</span>
					) : null}
				</div>
				<div className="hoja__actions">
					<div className="hoja__zoom" role="group" aria-label="Zoom">
						<button
							type="button"
							className="hoja__zoom-btn"
							aria-label="Alejar"
							title="Alejar"
							disabled={zoom <= ZOOM_STEPS[0]}
							onClick={() => setZoom((z) => stepZoom(z, -1))}
						>
							<ZoomOut size={15} aria-hidden="true" />
						</button>
						<button
							type="button"
							className="hoja__zoom-value"
							title="Volver a 100 %"
							aria-label={`Zoom ${zoom} %, volver a 100 %`}
							onClick={() => setZoom(100)}
						>
							{zoom}%
						</button>
						<button
							type="button"
							className="hoja__zoom-btn"
							aria-label="Acercar"
							title="Acercar"
							disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
							onClick={() => setZoom((z) => stepZoom(z, 1))}
						>
							<ZoomIn size={15} aria-hidden="true" />
						</button>
					</div>
					<button
						type="button"
						className="hoja__btn"
						disabled={sheet.rows >= MAX_ROWS}
						onClick={() => change((b) => growSheet(b, sheet.id, { rows: 10 }))}
					>
						<Plus size={14} aria-hidden="true" />
						10 filas
					</button>
					<button
						type="button"
						className="hoja__btn"
						disabled={sheet.cols >= MAX_COLS}
						onClick={() => change((b) => growSheet(b, sheet.id, { cols: 1 }))}
					>
						<Plus size={14} aria-hidden="true" />
						1 columna
					</button>
					<button type="button" className="hoja__btn" onClick={downloadCsv} disabled={!hasCells}>
						<Download size={14} aria-hidden="true" />
						CSV
					</button>
				</div>
			</div>

			<div className="hoja__format" role="toolbar" aria-label="Formato">
				<div className="hoja__group" role="group" aria-label="Deshacer">
					<ToolButton label="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={() => stepHistory("undo")}>
						<Undo2 size={15} aria-hidden="true" />
					</ToolButton>
					<ToolButton label="Rehacer (Ctrl+Y)" disabled={!canRedo} onClick={() => stepHistory("redo")}>
						<Redo2 size={15} aria-hidden="true" />
					</ToolButton>
				</div>
				<div className="hoja__group" role="group" aria-label="Letra">
					<select
						className="hoja__size"
						aria-label="Tamaño de letra"
						title="Tamaño de letra"
						value={activeSize}
						onChange={(event) => {
							paint({ size: Number(event.target.value) });
							focusGrid();
						}}
					>
						{sizeOptions.map((size) => (
							<option key={size} value={size}>
								{size}
							</option>
						))}
					</select>
					{FLAG_BUTTONS.map(({ flag, label, icon }) => (
						<ToolButton key={flag} label={label} pressed={Boolean(activeStyle?.[flag])} onClick={() => toggleFlag(flag)}>
							{icon}
						</ToolButton>
					))}
				</div>
				<div className="hoja__group" role="group" aria-label="Alinear">
					{ALIGN_BUTTONS.map(({ align, label, icon }) => {
						const pressed = activeStyle?.align === align;
						return (
							<ToolButton key={align} label={label} pressed={pressed} onClick={() => paint({ align: pressed ? null : align })}>
								{icon}
							</ToolButton>
						);
					})}
				</div>
				<div className="hoja__group" role="group" aria-label="Bordes y colores">
					<BordesMenu onPick={setBorders} onDone={focusGrid} />
					<ColorMenu
						label="Relleno"
						icon={<PaintBucket size={15} aria-hidden="true" />}
						colors={FILL_COLORS}
						noneLabel="Sin relleno"
						current={activeStyle?.bg ?? null}
						onPick={(color) => paint({ bg: color })}
						onDone={focusGrid}
					/>
					<ColorMenu
						label="Color de letra"
						icon={<Baseline size={15} aria-hidden="true" />}
						colors={TEXT_COLORS}
						noneLabel="Automático"
						current={activeStyle?.color ?? null}
						onPick={(color) => paint({ color })}
						onDone={focusGrid}
					/>
				</div>
			</div>

			<div className="hoja__bar">
				<span className="hoja__name" aria-label="Celdas elegidas">
					{nameLabel}
				</span>
				<span className="hoja__fx" aria-hidden="true">
					fx
				</span>
				<input
					ref={barRef}
					className="hoja__formula"
					aria-label="Contenido de la celda"
					placeholder="Un número, un texto o una fórmula: =A1+B1, =SUMA(A1:A31)"
					spellCheck={false}
					autoComplete="off"
					value={barEditing ? editing.draft : rawAt(active)}
					onFocus={() => {
						if (!editRef.current) startEdit(active, rawAt(active), "edit", "bar");
					}}
					onChange={(event) => {
						const current = editRef.current ?? { ...active, draft: "", mode: "edit" as const, from: "bar" as const };
						setEditing({ ...current, draft: event.target.value });
					}}
					onKeyDown={onEditorKeyDown}
					onPaste={onEditorPaste}
					onBlur={() => {
						if (editRef.current?.from === "bar") commitEdit();
					}}
				/>
			</div>

			<div
				ref={gridRef}
				className="hoja__grid"
				tabIndex={0}
				aria-label={`Hoja ${sheet.name}`}
				style={{ "--hoja-zoom": zoom / 100 } as CSSProperties}
				onKeyDown={onGridKeyDown}
				onCopy={(event) => copySelection(event, false)}
				onCut={(event) => copySelection(event, true)}
				onPaste={onGridPaste}
			>
				<table className="hoja__table">
					<thead>
						<tr>
							<th
								className="hoja__corner"
								title="Marcar toda la hoja"
								onMouseDown={(event) => {
									if (event.button !== 0) return;
									event.preventDefault();
									commitEdit();
									setSel(selectAll(sheet));
									focusGrid();
								}}
							/>
							{colHeads}
						</tr>
					</thead>
					<tbody>{rows}</tbody>
				</table>
			</div>

			<div className="hoja__tabs">
				{book.sheets.map((s) => {
					const isActive = s.id === sheet.id;
					if (renamingId === s.id) {
						return (
							<input
								key={s.id}
								className="hoja__tab-input"
								aria-label="Nombre de la hoja"
								defaultValue={s.name}
								maxLength={31}
								autoFocus
								onFocus={(event) => event.currentTarget.select()}
								onKeyDown={(event) => {
									if (event.key === "Enter") event.currentTarget.blur();
									else if (event.key === "Escape") {
										event.currentTarget.dataset.cancel = "1";
										event.currentTarget.blur();
									}
								}}
								onBlur={(event) => {
									if (!event.currentTarget.dataset.cancel) {
										const name = event.currentTarget.value;
										change((b) => renameSheet(b, s.id, name));
									}
									setRenamingId(null);
								}}
							/>
						);
					}
					return (
						<div key={s.id} className={`hoja__tab${isActive ? " is-active" : ""}`}>
							<button
								type="button"
								className="hoja__tab-btn"
								aria-pressed={isActive}
								title="Doble clic para cambiar el nombre"
								onClick={() => openSheet(s.id)}
								onDoubleClick={() => setRenamingId(s.id)}
							>
								{s.name}
							</button>
							{isActive && book.sheets.length > 1 ? (
								<button
									type="button"
									className="hoja__tab-del"
									aria-label={`Borrar la hoja ${s.name}`}
									title="Borrar hoja"
									onClick={() => deleteSheet(s.id, s.name)}
								>
									<X size={12} aria-hidden="true" />
								</button>
							) : null}
						</div>
					);
				})}
				<button
					type="button"
					className="hoja__tab-add"
					aria-label="Agregar hoja"
					title="Agregar hoja"
					onClick={() => {
						commitEdit();
						change((b) => addSheet(b));
						resetSelection();
					}}
				>
					<Plus size={14} aria-hidden="true" />
				</button>
			</div>

			<p className="hoja__help">
				Las fórmulas empiezan con <code>=</code>: <code>+ - * /</code>, paréntesis, celdas como <code>B3</code> y{" "}
				<code>=SUMA(A1:A31)</code>. Shift+clic marca un bloque, Ctrl+clic suma celdas y arrastrar también marca; en
				el celular, mantén apretado y arrastra. Doble clic o F2 para editar; Supr borra. <code>Ctrl+C</code>,{" "}
				<code>Ctrl+X</code> y <code>Ctrl+V</code> copian, cortan y pegan (también desde Excel, con su formato);{" "}
				<code>Ctrl+Z</code> deshace. <code>Ctrl+B</code> negrita, <code>Ctrl+I</code> cursiva, <code>Ctrl+U</code>{" "}
				subrayado.
			</p>
		</div>
	);
}
