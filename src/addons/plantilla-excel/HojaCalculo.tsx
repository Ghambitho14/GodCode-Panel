import {
	memo,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type CSSProperties,
	type Dispatch,
	type KeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type RefObject,
	type SetStateAction,
} from "react";
import { Baseline, Download, PaintBucket, Plus, X, ZoomIn, ZoomOut } from "lucide-react";

import ColorMenu from "./ColorMenu";
import { FILL_COLORS, TEXT_COLORS, TEXT_ON_FILL } from "./colores";
import {
	activeSheet,
	addSheet,
	addToSelection,
	cellKey,
	clearCells,
	columnLabel,
	evaluateSheet,
	extendSelection,
	growSheet,
	isMultiSelection,
	keysInRanges,
	MAX_COLS,
	MAX_ROWS,
	parseCellRef,
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
	ZOOM_STEPS,
	type CellResult,
	type CellStyle,
	type Pos,
	type Selection,
	type SelectionKind,
	type Workbook,
} from "./hoja-calculo";
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

function cellStyle(style: CellStyle | undefined, isError: boolean): CSSProperties | undefined {
	if (!style) return undefined;
	const color = style.color ?? (style.bg ? TEXT_ON_FILL : undefined);
	return { backgroundColor: style.bg, color: isError ? undefined : color };
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
				className={`hoja__cell${kind}${activeCol === col ? " is-selected" : ""}${inRange ? " is-in-range" : ""}`}
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

function saveStatusText(status: SaveStatus, savedAt: Date | null, locale: string): string {
	if (status === "saving") return "Guardando…";
	if (status === "offline") return "Sin conexión: guardado en este navegador, se reintenta";
	if (status === "local") return "Se guarda en este navegador";
	if (!savedAt) return "Sin cambios";
	return `Guardado ${savedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
}

export default function HojaCalculo({
	book,
	onBookChange: setBook,
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
	const { zoom, setZoom } = useZoom(zoomKey);

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

	const format = useMemo(() => {
		let nf: Intl.NumberFormat;
		try {
			nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });
		} catch {
			nf = new Intl.NumberFormat("es", { maximumFractionDigits: 4 });
		}
		return (value: number) => nf.format(value);
	}, [locale]);

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
		setBook((b) => setCell(b, sheetId, cellKey(current.col, current.row), current.draft));
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

	/** Teclas de la hoja cuando no se está editando. */
	const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		const { key, shiftKey } = event;
		const mod = event.ctrlKey || event.metaKey;
		const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
		let handled = true;
		if (arrows[key] && shiftKey) extendTo({ col: sel.focus.col + arrows[key][0], row: sel.focus.row + arrows[key][1] });
		else if (arrows[key]) moveBy(arrows[key][0], arrows[key][1]);
		else if (mod && key.toLowerCase() === "a") setSel(selectAll(sheet));
		else if (key === "Enter") moveBy(0, shiftKey ? -1 : 1);
		else if (key === "Tab") moveBy(shiftKey ? -1 : 1, 0);
		else if (key === "F2") startEdit(active, rawAt(active), "edit");
		else if (key === "Delete" || key === "Backspace") {
			const sheetId = sheet.id;
			const keys = selectedKeys();
			setBook((b) => clearCells(b, sheetId, keys));
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
		setBook((b) => ({ ...b, activeSheetId: id }));
		resetSelection();
	};

	const deleteSheet = (id: string, name: string) => {
		if (!window.confirm(`¿Borrar la hoja «${name}» y todo lo que tiene?`)) return;
		setEditing(null);
		setBook((b) => removeSheet(b, id));
		resetSelection();
	};

	const paint = (patch: { bg?: string | null; color?: string | null }) => {
		const sheetId = sheet.id;
		const keys = selectedKeys();
		setBook((b) => setStyle(b, sheetId, keys, patch));
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
	const activeStyle = sheet.styles[activeKey];
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
				<span
					className={`hoja__status${saveStatus === "offline" ? " is-offline" : ""}`}
					role="status"
					title={saveStatus === "offline" ? "Los cambios quedan en este navegador y se suben solos al volver la conexión." : undefined}
				>
					{branchName ? `${branchName} · ` : ""}
					{saveStatusText(saveStatus, savedAt, locale)}
				</span>
				<div className="hoja__actions">
					<div className="hoja__colors" role="group" aria-label="Colores">
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
						onClick={() => setBook((b) => growSheet(b, sheet.id, { rows: 10 }))}
					>
						<Plus size={14} aria-hidden="true" />
						10 filas
					</button>
					<button
						type="button"
						className="hoja__btn"
						disabled={sheet.cols >= MAX_COLS}
						onClick={() => setBook((b) => growSheet(b, sheet.id, { cols: 1 }))}
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
										setBook((b) => renameSheet(b, s.id, name));
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
						setBook((b) => addSheet(b));
						resetSelection();
					}}
				>
					<Plus size={14} aria-hidden="true" />
				</button>
			</div>

			<p className="hoja__help">
				Las fórmulas empiezan con <code>=</code>: <code>+ - * /</code>, paréntesis, celdas como <code>B3</code> y{" "}
				<code>=SUMA(A1:A31)</code>. Shift+clic marca un bloque, Ctrl+clic suma celdas y arrastrar también marca; en
				el celular, mantén apretado y arrastra. Doble clic o F2 para editar; Supr borra.
			</p>
		</div>
	);
}
