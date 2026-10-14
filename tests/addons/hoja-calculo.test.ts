import { describe, expect, it } from "vitest";

import {
	addSheet,
	applyBorders,
	blockFromSheet,
	cellKey,
	clearCells,
	columnLabel,
	columnRange,
	emptyWorkbook,
	evaluateSheet,
	growSheet,
	inRanges,
	keysInRanges,
	MAX_ROWS,
	parseCellRef,
	parseNumber,
	pasteBlock,
	rangeFrom,
	rangeLabel,
	removeSheet,
	renameSheet,
	reviveWorkbook,
	reviveZoom,
	rowRange,
	setCell,
	setStyle,
	sheetCsv,
	sheetRange,
	shiftFormula,
	stepZoom,
	trimToUsed,
	type ClipBlock,
	type Sheet,
} from "@/addons/plantilla-excel/hoja-calculo";

describe("zoom", () => {
	it("acerca y aleja por niveles sin salirse de 50–200 %", () => {
		expect(stepZoom(100, 1)).toBe(110);
		expect(stepZoom(100, -1)).toBe(90);
		expect(stepZoom(200, 1)).toBe(200);
		expect(stepZoom(50, -1)).toBe(50);
		expect(stepZoom(105, 1)).toBe(110);
	});

	it("un zoom guardado raro vuelve a 100 %", () => {
		expect(reviveZoom("125")).toBe(125);
		expect(reviveZoom("999")).toBe(100);
		expect(reviveZoom(null)).toBe(100);
	});
});

function sheetWith(cells: Record<string, string>): Sheet {
	return { id: "s1", name: "Hoja 1", rows: 50, cols: 26, cells, styles: {} };
}

describe("selección", () => {
	const sheet = { ...sheetWith({}), rows: 10, cols: 5 };

	it("normaliza rangos y los nombra como Excel", () => {
		const range = rangeFrom({ col: 1, row: 4 }, { col: 0, row: 1 });
		expect(range).toEqual({ c0: 0, r0: 1, c1: 1, r1: 4 });
		expect(rangeLabel(range)).toBe("A2:B5");
		expect(rangeLabel(rangeFrom({ col: 2, row: 2 }, { col: 2, row: 2 }))).toBe("C3");
		expect(columnRange(sheet, 3, 1)).toEqual({ c0: 1, r0: 0, c1: 3, r1: 9 });
		expect(rowRange(sheet, 2)).toEqual({ c0: 0, r0: 2, c1: 4, r1: 2 });
		expect(rangeLabel(sheetRange(sheet))).toBe("A1:E10");
	});

	it("junta celdas de varios rangos sin repetir y sin salirse de la hoja", () => {
		const keys = keysInRanges(
			[rangeFrom({ col: 0, row: 0 }, { col: 1, row: 1 }), rangeFrom({ col: 1, row: 1 }, { col: 9, row: 1 })],
			sheet,
		);
		expect(keys).toEqual(["A1", "B1", "A2", "B2", "C2", "D2", "E2"]);
		expect(inRanges([rangeFrom({ col: 1, row: 1 }, { col: 2, row: 2 })], 2, 1)).toBe(true);
		expect(inRanges([rangeFrom({ col: 1, row: 1 }, { col: 2, row: 2 })], 3, 1)).toBe(false);
	});
});

describe("colores", () => {
	it("pinta, mezcla relleno y letra, y quita con null", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setStyle(book, id, ["a1", "B2"], { bg: "#FFF4BF" });
		book = setStyle(book, id, ["B2"], { color: "#dc2626" });
		expect(book.sheets[0].styles).toEqual({ A1: { bg: "#fff4bf" }, B2: { bg: "#fff4bf", color: "#dc2626" } });

		book = setStyle(book, id, ["A1", "B2"], { bg: null });
		expect(book.sheets[0].styles).toEqual({ B2: { color: "#dc2626" } });

		book = setStyle(book, id, ["B2"], { color: "rojo" });
		expect(book.sheets[0].styles).toEqual({ B2: { color: "#dc2626" } });
	});

	it("borrar el contenido deja los colores", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setCell(book, id, "A1", "10");
		book = setCell(book, id, "A2", "20");
		book = setStyle(book, id, ["A1"], { bg: "#dff5e1" });
		book = clearCells(book, id, ["A1", "a2"]);
		expect(book.sheets[0].cells).toEqual({});
		expect(book.sheets[0].styles).toEqual({ A1: { bg: "#dff5e1" } });
	});

	it("una hoja guardada sin colores o con colores raros se revive bien", () => {
		const book = reviveWorkbook({
			version: 1,
			activeSheetId: "a",
			sheets: [
				{ id: "a", name: "Vieja", rows: 5, cols: 5, cells: { A1: "1" } },
				{ id: "b", name: "Rara", rows: 5, cols: 5, cells: {}, styles: { a1: { bg: "#ABCDEF", color: "rojo" }, B1: { bg: "#12" }, "??": { bg: "#ffffff" } } },
			],
		});
		expect(book.sheets[0].styles).toEqual({});
		expect(book.sheets[1].styles).toEqual({ A1: { bg: "#abcdef" } });
	});
});

describe("formato de letra", () => {
	it("pone y quita negrita, cursiva, subrayado, tachado, tamaño y alineación", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setStyle(book, id, ["A1", "B1"], { bold: true, italic: true, size: 14, align: "center" });
		book = setStyle(book, id, ["A1"], { underline: true, strike: true, bg: "#fff4bf" });
		expect(book.sheets[0].styles).toEqual({
			A1: { bg: "#fff4bf", bold: true, italic: true, underline: true, strike: true, size: 14, align: "center" },
			B1: { bold: true, italic: true, size: 14, align: "center" },
		});

		// false o null quitan; el tamaño 11 es el normal y no se guarda.
		book = setStyle(book, id, ["A1", "B1"], { bold: false, italic: null, size: 11, align: null });
		expect(book.sheets[0].styles).toEqual({ A1: { bg: "#fff4bf", underline: true, strike: true } });

		// Un valor que no sirve deja lo que había; sin cambios, el mismo libro.
		const same = setStyle(book, id, ["A1"], { size: 500, underline: true });
		expect(same).toBe(book);
	});

	it("revive el formato nuevo y descarta lo raro", () => {
		const book = reviveWorkbook({
			version: 1,
			activeSheetId: "a",
			sheets: [
				{
					id: "a",
					name: "Caja",
					rows: 5,
					cols: 5,
					cells: {},
					styles: {
						A1: { bold: true, italic: "si", size: 14.4, align: "center", border: { t: true, x: true, b: 1 } },
						A2: { size: 11, align: "justify", border: {} },
						A3: { underline: true, strike: true, size: 200 },
					},
				},
			],
		});
		expect(book.sheets[0].styles).toEqual({
			A1: { bold: true, size: 14, align: "center", border: { t: true } },
			A3: { underline: true, strike: true },
		});
	});
});

describe("bordes", () => {
	const block = rangeFrom({ col: 1, row: 1 }, { col: 2, row: 2 });

	it("todos, exterior y por lado van por el borde del bloque", () => {
		const book = emptyWorkbook();
		const id = book.activeSheetId;
		expect(applyBorders(book, id, [block], "all").sheets[0].styles).toEqual({
			B2: { border: { t: true, r: true, b: true, l: true } },
			C2: { border: { t: true, r: true, b: true, l: true } },
			B3: { border: { t: true, r: true, b: true, l: true } },
			C3: { border: { t: true, r: true, b: true, l: true } },
		});
		expect(applyBorders(book, id, [block], "outer").sheets[0].styles).toEqual({
			B2: { border: { t: true, l: true } },
			C2: { border: { t: true, r: true } },
			B3: { border: { b: true, l: true } },
			C3: { border: { r: true, b: true } },
		});
		expect(applyBorders(book, id, [block], "bottom").sheets[0].styles).toEqual({
			B3: { border: { b: true } },
			C3: { border: { b: true } },
		});
	});

	it("sin bordes también limpia el lado que comparte la vecina, y deja los colores", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setStyle(book, id, ["B2"], { bg: "#dff5e1" });
		book = applyBorders(book, id, [rangeFrom({ col: 0, row: 0 }, { col: 3, row: 3 })], "all");
		book = applyBorders(book, id, [block], "none");
		const styles = book.sheets[0].styles;
		expect(styles.B2).toEqual({ bg: "#dff5e1" });
		expect(styles.C3).toBeUndefined();
		// La de arriba ya no tiene borde abajo; la de la izquierda, ni a la derecha.
		expect(styles.B1).toEqual({ border: { t: true, r: true, l: true } });
		expect(styles.A2).toEqual({ border: { t: true, b: true, l: true } });
		const empty = emptyWorkbook();
		expect(applyBorders(empty, empty.activeSheetId, [block], "none")).toBe(empty);
	});
});

describe("fórmulas copiadas", () => {
	it("corre las celdas relativas y deja fijas las de $", () => {
		expect(shiftFormula("=A2+B2", 0, 1)).toBe("=A3+B3");
		expect(shiftFormula("=SUMA(a1:a5)*$C$1+C$1+$D2", 1, 2)).toBe("=SUMA(B3:B7)*$C$1+D$1+$D4");
		expect(shiftFormula("=Z1+1", 1, 0)).toBe("=AA1+1");
		expect(shiftFormula("hola A1", 1, 1)).toBe("hola A1");
		expect(shiftFormula("=A1", 0, 0)).toBe("=A1");
	});

	it("una celda que se sale de la hoja queda #REF!", () => {
		const shifted = shiftFormula("=A1+B2", 0, -1);
		expect(shifted).toBe("=#REF!+B1");
		expect(valueOf({ C1: shifted }, "C1")?.error).toBe("#REF!");
	});
});

describe("pegar un bloque", () => {
	const at = (col: number, row: number) => [rangeFrom({ col, row }, { col, row })];
	const cells = (rows: string[][], style?: object): ClipBlock["cells"] =>
		rows.map((row) => row.map((raw) => ({ raw, style: style ?? null })));

	it("pega desde la celda activa, borra con vacías y devuelve lo pegado", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setCell(book, id, "C3", "viejo");
		const out = pasteBlock(book, id, at(1, 1), { cells: cells([["Fecha", "Monto"], ["", "62.500"]]), withStyles: false });
		expect(out.book.sheets[0].cells).toEqual({ B2: "Fecha", C2: "Monto", C3: "62.500" });
		expect(out.range).toEqual({ c0: 1, r0: 1, c1: 2, r1: 2 });
		expect(out.clipped).toBe(false);
	});

	it("con formato reemplaza el de destino; texto sin formato lo deja", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setStyle(book, id, ["A1", "B1"], { bg: "#fde2e1" });
		const plain = pasteBlock(book, id, at(0, 0), { cells: cells([["a", "b"]]), withStyles: false }).book;
		expect(plain.sheets[0].styles).toEqual({ A1: { bg: "#fde2e1" }, B1: { bg: "#fde2e1" } });
		const styled = pasteBlock(book, id, at(0, 0), {
			cells: [[{ raw: "a", style: { bold: true } }, { raw: "b", style: null }]],
			withStyles: true,
		}).book;
		expect(styled.sheets[0].styles).toEqual({ A1: { bold: true } });
	});

	it("agranda la hoja y corta lo que pasa del máximo", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		const tall = cells(Array.from({ length: 60 }, (_, i) => [String(i)]));
		const grown = pasteBlock(book, id, at(0, 0), { cells: tall, withStyles: false });
		expect(grown.book.sheets[0].rows).toBe(60);
		expect(grown.clipped).toBe(false);

		book = growSheet(book, id, { rows: MAX_ROWS });
		const clipped = pasteBlock(book, id, at(0, MAX_ROWS - 2), { cells: cells([["1"], ["2"], ["3"]]), withStyles: false });
		expect(clipped.clipped).toBe(true);
		expect(clipped.range).toEqual({ c0: 0, r0: MAX_ROWS - 2, c1: 0, r1: MAX_ROWS - 1 });
		expect(Object.keys(clipped.book.sheets[0].cells)).toEqual([`A${MAX_ROWS - 1}`, `A${MAX_ROWS}`]);
	});

	it("una celda copiada llena todo lo marcado, corriendo su fórmula", () => {
		const book = emptyWorkbook();
		const id = book.activeSheetId;
		const out = pasteBlock(book, id, [rangeFrom({ col: 2, row: 2 }, { col: 2, row: 4 })], {
			cells: [[{ raw: "=A2+B2" }]],
			withStyles: true,
			from: { col: 2, row: 1 },
		});
		expect(out.book.sheets[0].cells).toEqual({ C3: "=A3+B3", C4: "=A4+B4", C5: "=A5+B5" });
	});

	it("copiado de esta hoja corre las fórmulas; cortado no", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setCell(book, id, "A1", "10");
		book = setCell(book, id, "B1", "=A1*2");
		book = setStyle(book, id, ["B1"], { bold: true });
		const copied = blockFromSheet(book.sheets[0], rangeFrom({ col: 0, row: 0 }, { col: 1, row: 0 }));
		expect(copied).toEqual([[{ raw: "10", style: null }, { raw: "=A1*2", style: { bold: true } }]]);

		const moved = pasteBlock(book, id, at(0, 3), { cells: copied, withStyles: true, from: { col: 0, row: 0 } }).book;
		expect(moved.sheets[0].cells.B4).toBe("=A4*2");
		expect(moved.sheets[0].styles.B4).toEqual({ bold: true });
		const cut = pasteBlock(book, id, at(0, 3), { cells: copied, withStyles: true }).book;
		expect(cut.sheets[0].cells.B4).toBe("=A1*2");
	});

	it("cortar borra contenido y formato; Supr solo el contenido", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setCell(book, id, "A1", "1");
		book = setStyle(book, id, ["A1"], { bold: true });
		expect(clearCells(book, id, ["A1"]).sheets[0].styles).toEqual({ A1: { bold: true } });
		const cut = clearCells(book, id, ["A1"], { withStyles: true }).sheets[0];
		expect(cut.cells).toEqual({});
		expect(cut.styles).toEqual({});
		expect(clearCells(book, id, ["Z9"])).toBe(book);
	});

	it("copiar una columna entera llega hasta la última celda usada", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setCell(book, id, "B3", "x");
		book = setStyle(book, id, ["B7"], { bold: true });
		const sheet = book.sheets[0];
		expect(trimToUsed(sheet, columnRange(sheet, 1))).toEqual({ c0: 1, r0: 0, c1: 1, r1: 6 });
		expect(trimToUsed(sheet, columnRange(sheet, 4))).toEqual({ c0: 4, r0: 0, c1: 4, r1: 0 });
	});
});

function valueOf(cells: Record<string, string>, key: string) {
	return evaluateSheet(sheetWith(cells)).get(key);
}

describe("columnas y celdas", () => {
	it("nombra columnas como Excel", () => {
		expect(columnLabel(0)).toBe("A");
		expect(columnLabel(25)).toBe("Z");
		expect(columnLabel(26)).toBe("AA");
		expect(columnLabel(27)).toBe("AB");
		expect(cellKey(1, 2)).toBe("B3");
	});

	it("lee nombres de celda en mayúscula, minúscula y con $", () => {
		expect(parseCellRef("B12")).toEqual({ col: 1, row: 11 });
		expect(parseCellRef("b12")).toEqual({ col: 1, row: 11 });
		expect(parseCellRef("$AA$1")).toEqual({ col: 26, row: 0 });
		expect(parseCellRef("A0")).toBeNull();
		expect(parseCellRef("12")).toBeNull();
		expect(parseCellRef("hola")).toBeNull();
	});

	it("lee números como se escriben a mano", () => {
		expect(parseNumber("62.500")).toBe(62500);
		expect(parseNumber("1.250,50")).toBe(1250.5);
		expect(parseNumber("1,5")).toBe(1.5);
		expect(parseNumber("12.5")).toBe(12.5);
		expect(parseNumber("0.125")).toBe(0.125);
		expect(parseNumber("1.000.000")).toBe(1000000);
		expect(Number.isNaN(parseNumber("12a"))).toBe(true);
	});
});

describe("fórmulas", () => {
	it("suma, resta, multiplica y divide con prioridades de Excel", () => {
		const cells = { A1: "10", B1: "4" };
		expect(valueOf({ ...cells, C1: "=A1+B1" }, "C1")).toEqual({ value: 14 });
		expect(valueOf({ C1: "=2+3*4" }, "C1")).toEqual({ value: 14 });
		expect(valueOf({ ...cells, C1: "=(A1-B1)*2" }, "C1")).toEqual({ value: 12 });
		expect(valueOf({ ...cells, C1: "=-A1" }, "C1")).toEqual({ value: -10 });
		expect(valueOf({ C1: "=10/4" }, "C1")).toEqual({ value: 2.5 });
		expect(valueOf({ C1: "= 0,1 + 0,2" }, "C1")).toEqual({ value: 0.3 });
	});

	it("acepta celdas en minúscula y vacías valen 0", () => {
		expect(valueOf({ A1: "5", C1: "=a1+b1" }, "C1")).toEqual({ value: 5 });
	});

	it("sigue una cadena de fórmulas", () => {
		const results = evaluateSheet(sheetWith({ A1: "62.500", B1: "=A1*2", C1: "=B1-25000" }));
		expect(results.get("B1")).toEqual({ value: 125000 });
		expect(results.get("C1")).toEqual({ value: 100000 });
	});

	it("muestra los errores en la celda", () => {
		expect(valueOf({ A1: "5", B1: "=A1/0" }, "B1")?.error).toBe("#DIV/0!");
		expect(valueOf({ A1: "hola", B1: "=A1+1" }, "B1")?.error).toBe("#VALOR!");
		expect(valueOf({ B1: "=ZZZ9999" }, "B1")?.error).toBe("#REF!");
		expect(valueOf({ B1: "=2+" }, "B1")?.error).toBe("#ERROR!");
		expect(valueOf({ B1: "=" }, "B1")?.error).toBe("#ERROR!");
		expect(valueOf({ B1: "=PROMEDIO(A1:A2)" }, "B1")?.error).toBe("#ERROR!");
	});

	it("un error se arrastra a las fórmulas que lo usan", () => {
		expect(valueOf({ A1: "=1/0", B1: "=A1+1" }, "B1")?.error).toBe("#DIV/0!");
	});

	it("detecta celdas que se usan a sí mismas", () => {
		const results = evaluateSheet(sheetWith({ A1: "=B1", B1: "=A1", C1: "=C1+1" }));
		expect(results.get("A1")?.error).toBe("#CICLO!");
		expect(results.get("B1")?.error).toBe("#CICLO!");
		expect(results.get("C1")?.error).toBe("#CICLO!");
	});

	it("SUMA de un rango salta textos y vacías", () => {
		const cells = { A1: "10", A2: "hola", A3: "5", B1: "2" };
		expect(valueOf({ ...cells, A5: "=SUMA(A1:A4)" }, "A5")).toEqual({ value: 15 });
		expect(valueOf({ ...cells, C1: "=SUMA(A3:A1)" }, "C1")).toEqual({ value: 15 });
		expect(valueOf({ ...cells, C1: "=suma(A1:B1)*2" }, "C1")).toEqual({ value: 24 });
	});

	it("SUM y varios argumentos separados por ;", () => {
		expect(valueOf({ A1: "1", A2: "2", C1: "=SUM(A1:A2;5)" }, "C1")).toEqual({ value: 8 });
		expect(valueOf({ C1: "=SUMA(1;2;3)" }, "C1")).toEqual({ value: 6 });
		expect(valueOf({ C1: "=SUMA()" }, "C1")?.error).toBe("#ERROR!");
		expect(valueOf({ C1: "=SUMA(A1:A999)" }, "C1")?.error).toBe("#REF!");
	});

	it("lo que no es fórmula queda como número o texto", () => {
		const results = evaluateSheet(sheetWith({ A1: "$ 40.000", A2: "-1,5", A3: "1000+500", A4: "Ventas" }));
		expect(results.get("A1")).toEqual({ value: 40000 });
		expect(results.get("A2")).toEqual({ value: -1.5 });
		expect(results.get("A3")).toEqual({ value: "1000+500" });
		expect(results.get("A4")).toEqual({ value: "Ventas" });
	});
});

describe("libro y hojas", () => {
	it("revive lo guardado y descarta basura", () => {
		expect(reviveWorkbook(null).sheets).toHaveLength(1);
		expect(reviveWorkbook({ version: 9 }).sheets).toHaveLength(1);
		const book = reviveWorkbook({
			version: 1,
			activeSheetId: "no-existe",
			sheets: [{ id: "a", name: "  Caja  ", rows: 99999, cols: -3, cells: { a1: "5", "??": "x", B2: 7 } }, "basura"],
		});
		expect(book.sheets).toHaveLength(1);
		expect(book.activeSheetId).toBe("a");
		expect(book.sheets[0]).toMatchObject({ name: "Caja", rows: 1000, cols: 1, cells: { A1: "5" } });
	});

	it("agrega, renombra y borra hojas sin quedar en cero", () => {
		let book = emptyWorkbook();
		const first = book.sheets[0].id;
		book = addSheet(book);
		expect(book.sheets.map((s) => s.name)).toEqual(["Hoja 1", "Hoja 2"]);
		expect(book.activeSheetId).toBe(book.sheets[1].id);

		expect(renameSheet(book, first, "hoja 2")).toBe(book);
		expect(renameSheet(book, first, "   ")).toBe(book);
		book = renameSheet(book, first, "Enero");
		expect(book.sheets[0].name).toBe("Enero");

		book = removeSheet(book, book.sheets[1].id);
		expect(book.sheets).toHaveLength(1);
		expect(book.activeSheetId).toBe(first);
		expect(removeSheet(book, first)).toBe(book);
	});

	it("escribe y borra celdas, y exporta CSV con los resultados", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setCell(book, id, "a1", "Total");
		book = setCell(book, id, "B1", "=2,5*2");
		book = setCell(book, id, "B2", "x;y");
		book = setCell(book, id, "C3", "1");
		book = setCell(book, id, "C3", "");
		const sheet = book.sheets[0];
		expect(sheet.cells).toEqual({ A1: "Total", B1: "=2,5*2", B2: "x;y" });
		expect(sheetCsv(sheet, evaluateSheet(sheet))).toBe('Total;5\n;"x;y"');
	});
});
