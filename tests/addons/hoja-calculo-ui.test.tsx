import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import HojaCalculo from "@/addons/plantilla-excel/HojaCalculo";
import { emptyWorkbook, setCell, type Workbook } from "@/addons/plantilla-excel/hoja-calculo";

function Harness({ initial }: { initial: Workbook }) {
	const [book, setBook] = useState(initial);
	return <HojaCalculo book={book} onBookChange={setBook} saveStatus="saved" savedAt={null} zoomKey="test:hoja:zoom" locale="es-CL" />;
}

/** Portapapeles de mentira: guarda lo que se copia y lo devuelve al pegar. */
function fakeClipboard(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		getData: (type: string) => data.get(type) ?? "",
		setData: (type: string, value: string) => void data.set(type, value),
	};
}

const grid = () => screen.getByLabelText("Hoja Hoja 1");
const cell = (key: string) => document.querySelector<HTMLElement>(`[data-cell="${key}"]`)!;
const selected = () => screen.getByLabelText("Celdas elegidas").textContent;
const clickCell = (key: string) => fireEvent.mouseDown(cell(key), { button: 0 });

describe("hoja: pegar, formato y deshacer", () => {
	afterEach(cleanup);

	it("pega un bloque copiado de Excel desde la celda activa y lo marca", () => {
		render(<Harness initial={emptyWorkbook()} />);
		clickCell("B2");
		fireEvent.paste(grid(), {
			clipboardData: fakeClipboard({
				"text/plain": "Fecha\tMonto\r\nHoy\t62.500\r\n",
				"text/html": '<table><tr><td style="font-weight:bold">Fecha</td><td>Monto</td></tr><tr><td>Hoy</td><td>62.500</td></tr></table>',
			}),
		});
		expect(cell("B2").textContent).toBe("Fecha");
		expect(cell("B2").style.fontWeight).toBe("700");
		expect(cell("C3").textContent).toBe("62.500");
		expect(selected()).toBe("B2:C3");
	});

	it("Ctrl+B pone negrita en lo marcado y Ctrl+Z / Ctrl+Y deshacen y rehacen", () => {
		const book = emptyWorkbook();
		render(<Harness initial={setCell(book, book.activeSheetId, "A1", "Caja")} />);

		clickCell("A1");
		fireEvent.keyDown(grid(), { key: "b", ctrlKey: true });
		expect(cell("A1").style.fontWeight).toBe("700");

		fireEvent.keyDown(grid(), { key: "z", ctrlKey: true });
		expect(cell("A1").style.fontWeight).toBe("");
		expect(cell("A1").textContent).toBe("Caja");

		fireEvent.keyDown(grid(), { key: "y", ctrlKey: true });
		expect(cell("A1").style.fontWeight).toBe("700");
		expect(screen.getByRole("button", { name: "Negrita (Ctrl+B)" }).getAttribute("aria-pressed")).toBe("true");
	});

	it("copiar y pegar dentro de la hoja corre la fórmula; afuera va el resultado", () => {
		let book = emptyWorkbook();
		const id = book.activeSheetId;
		book = setCell(book, id, "A1", "10");
		book = setCell(book, id, "A2", "4");
		book = setCell(book, id, "B1", "=A1*2");
		render(<Harness initial={book} />);
		const clipboard = fakeClipboard();

		clickCell("B1");
		fireEvent.copy(grid(), { clipboardData: clipboard });
		expect(clipboard.getData("text/plain")).toBe("20");
		expect(clipboard.getData("text/html")).toContain("<td>20</td>");

		clickCell("B2");
		fireEvent.paste(grid(), { clipboardData: clipboard });
		expect(cell("B2").textContent).toBe("8");
		expect(screen.getByLabelText<HTMLInputElement>("Contenido de la celda").value).toBe("=A2*2");
	});

	it("cortar deja el portapapeles y borra el origen", () => {
		const book = emptyWorkbook();
		render(<Harness initial={setCell(book, book.activeSheetId, "A1", "mover")} />);
		const clipboard = fakeClipboard();
		clickCell("A1");
		fireEvent.cut(grid(), { clipboardData: clipboard });
		expect(cell("A1").textContent).toBe("");
		clickCell("C3");
		fireEvent.paste(grid(), { clipboardData: clipboard });
		expect(cell("C3").textContent).toBe("mover");
	});

	it("pegar varias celdas mientras se escribe en una pega el bloque desde ahí", () => {
		render(<Harness initial={emptyWorkbook()} />);
		clickCell("A1");
		fireEvent.keyDown(grid(), { key: "x" });
		const editor = screen.getByLabelText("Celda A1");
		fireEvent.paste(editor, { clipboardData: fakeClipboard({ "text/plain": "1\t2\r\n" }) });
		expect(screen.queryByLabelText("Celda A1")).toBeNull();
		expect(cell("A1").textContent).toBe("1");
		expect(cell("B1").textContent).toBe("2");
	});
});
