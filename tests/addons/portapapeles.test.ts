import { describe, expect, it } from "vitest";

import type { CellStyle } from "@/addons/plantilla-excel/hoja-calculo";
import { parseClipboardHtml, parseTsv, toHtml, toTsv } from "@/addons/plantilla-excel/portapapeles";

describe("texto con tabulaciones", () => {
	it("lee filas y columnas como las deja Excel (con \\r\\n y salto final)", () => {
		expect(parseTsv("Fecha\tMonto\r\n14/10\t62.500\r\n")).toEqual([
			["Fecha", "Monto"],
			["14/10", "62.500"],
		]);
		expect(parseTsv("solo\r\n")).toEqual([["solo"]]);
		expect(parseTsv("\r\n")).toEqual([[""]]);
		expect(parseTsv("")).toEqual([]);
	});

	it("entiende celdas entre comillas con saltos y comillas dobles", () => {
		expect(parseTsv('"línea 1\nlínea 2"\tB\r\nC\t"dice ""hola"""\r\n')).toEqual([
			["línea 1\nlínea 2", "B"],
			["C", 'dice "hola"'],
		]);
		// Una comilla en medio no abre nada.
		expect(parseTsv('5" pulgadas\tx')).toEqual([['5" pulgadas', "x"]]);
	});

	it("completa filas cortas y respeta celdas vacías al final", () => {
		expect(parseTsv("a\tb\nc")).toEqual([
			["a", "b"],
			["c", ""],
		]);
		expect(parseTsv("a\t\n")).toEqual([["a", ""]]);
	});

	it("ida y vuelta con toTsv", () => {
		const values = [
			["a", "b\tc"],
			['"x', "línea\nnueva"],
		];
		expect(parseTsv(toTsv(values))).toEqual(values);
	});
});

const EXCEL_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Excel.Sheet>
<style>
<!--table
	{mso-displayed-decimal-separator:"\\,";}
@page
	{margin:.75in .7in .75in .7in;}
td
	{padding-top:1px;
	color:black;
	font-size:11.0pt;
	font-weight:400;
	font-style:normal;
	text-decoration:none;
	font-family:Calibri, sans-serif;
	text-align:general;
	border:none;
	mso-pattern:auto;}
.xl65
	{font-size:14.0pt;
	font-weight:700;
	text-align:center;
	border-top:none;
	border-right:none;
	border-bottom:.5pt solid windowtext;
	border-left:none;
	background:#FFFF00;
	mso-pattern:black none;}
.xl66
	{color:red;
	font-style:italic;
	text-decoration:underline;
	text-underline-style:single;}
.xl67
	{border:.5pt solid windowtext;}
-->
</style>
</head>
<body link="#0563C1">
<table border=0 cellpadding=0 cellspacing=0 width=192 style='border-collapse:collapse;width:144pt'>
<!--StartFragment-->
 <col width=64 span=3 style='width:48pt'>
 <tr height=25 style='height:18.75pt'>
  <td colspan=2 height=25 class=xl65 width=128 style='height:18.75pt;width:96pt'>Caja diaria</td>
  <td class=xl66 width=64 style='width:48pt'>nota</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td height=20 style='height:15.0pt'>Ventas</td>
  <td align=right class=xl67>62.500</td>
  <td></td>
 </tr>
<!--EndFragment-->
</table>
</body>
</html>`;

const SHEETS_HTML =
	'<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style>' +
	'<table cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;border-collapse:collapse;border:none"><tbody>' +
	'<tr style="height:21px;"><td style="overflow:hidden;font-size:14pt;font-weight:bold;">Fecha</td><td style="overflow:hidden;font-size:10pt;background-color:#ffffff;color:#000000;">Monto</td></tr>' +
	'<tr style="height:21px;"><td style="overflow:hidden;font-size:10pt;">14/10</td><td style="overflow:hidden;font-size:10pt;text-align:right;border-bottom:1px solid #000000;">62500</td></tr>' +
	"</tbody></table></google-sheets-html-origin>";

const LIBREOFFICE_HTML =
	'<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN"><html><head><meta http-equiv="content-type" content="text/html; charset=utf-8"/>' +
	'<style type="text/css">body,div,table,thead,tbody,tfoot,tr,th,td,p { font-family:"Liberation Sans"; font-size:x-small }</style></head><body>' +
	'<table cellspacing="0" border="0"><colgroup width="85"></colgroup><colgroup width="85"></colgroup><tr>' +
	'<td style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000" height="17" align="left" bgcolor="#FFFF00"><b><i><font color="#C9211E">Total</font></i></b></td>' +
	'<td align="right" sdval="1500">1500</td></tr></table></body></html>';

describe("formato del HTML copiado", () => {
	it("Excel: clases, celdas combinadas, negro y alineación normal no se guardan", () => {
		const values = parseTsv("Caja diaria\t\tnota\r\nVentas\t62.500\t\r\n");
		expect(parseClipboardHtml(EXCEL_HTML, values)).toEqual([
			[
				{ bg: "#ffff00", bold: true, size: 14, align: "center", border: { b: true } },
				// La parte que cubre la combinada sigue la franja: relleno y borde, sin el resto.
				{ bg: "#ffff00", border: { b: true } },
				{ color: "#ff0000", italic: true, underline: true },
			],
			[null, { border: { t: true, r: true, b: true, l: true } }, null],
		]);
	});

	it("una combinada con borde exterior lo reparte solo por su orilla", () => {
		const html =
			'<table><tr><td rowspan="2" colspan="2" style="border:1px solid #000;background:#ddeffe">Título</td><td>x</td></tr><tr><td>y</td></tr></table>';
		expect(parseClipboardHtml(html, parseTsv("Título\t\tx\n\t\ty"))).toEqual([
			[{ bg: "#ddeffe", border: { t: true, l: true } }, { bg: "#ddeffe", border: { t: true, r: true } }, null],
			[{ bg: "#ddeffe", border: { b: true, l: true } }, { bg: "#ddeffe", border: { r: true, b: true } }, null],
		]);
	});

	it("Google Sheets: sin cuadrícula gris, y su 10 pt de todo cuenta como la letra normal", () => {
		const values = parseTsv("Fecha\tMonto\r\n14/10\t62500");
		expect(parseClipboardHtml(SHEETS_HTML, values)).toEqual([
			[{ bold: true, size: 14 }, null],
			[null, { border: { b: true } }],
		]);
	});

	it("LibreOffice: etiquetas <b>, <i>, <font> y bgcolor", () => {
		const values = parseTsv("Total\t1500\n");
		expect(parseClipboardHtml(LIBREOFFICE_HTML, values)).toEqual([
			[{ bg: "#ffff00", color: "#c9211e", bold: true, italic: true, border: { t: true, r: true, b: true, l: true } }, null],
		]);
	});

	it("una sola celda sin tabla toma el formato que la envuelve", () => {
		expect(parseClipboardHtml('<span style="font-weight:bold">Hola</span>', [["Hola"]])).toEqual([[{ bold: true }]]);
		const sheetsCell =
			'<meta charset="utf-8"><google-sheets-html-origin><style>td {border:1px solid #ccc}</style><span style="font-style:italic">Hola</span></google-sheets-html-origin>';
		expect(parseClipboardHtml(sheetsCell, [["Hola"]])).toEqual([[{ italic: true }]]);
	});

	it("si la tabla no calza con el texto, o no hay HTML, solo valores", () => {
		expect(parseClipboardHtml(EXCEL_HTML, [["solo una"]])).toBeNull();
		expect(parseClipboardHtml("", [["a"]])).toBeNull();
		expect(parseClipboardHtml("<p>a</p><p>b</p>", [["a", "b"]])).toBeNull();
	});

	it("no ejecuta nada del HTML", () => {
		const html = '<table><tr><td><img src="x" onerror="window.__hojaPwned = 1">a</td></tr></table><script>window.__hojaPwned = 2</script>';
		parseClipboardHtml(html, [["a"]]);
		expect((window as unknown as { __hojaPwned?: number }).__hojaPwned).toBeUndefined();
	});

	it("ida y vuelta: lo que se copia desde aquí vuelve con el mismo formato", () => {
		const values = [
			["Total", "1500"],
			["x", ""],
		];
		const styles: Array<Array<CellStyle | null>> = [
			[
				{ bg: "#fff4bf", color: "#c9211e", bold: true, size: 14, align: "center", border: { t: true, b: true } },
				{ italic: true, underline: true, strike: true },
			],
			[null, { border: { r: true } }],
		];
		expect(parseClipboardHtml(toHtml(values, styles), values)).toEqual(styles);
	});

	it("escapa el texto al armar el HTML", () => {
		expect(toHtml([["<b>&\"</b>"]], [[null]])).toBe("<table><tbody><tr><td>&lt;b&gt;&amp;&quot;&lt;/b&gt;</td></tr></tbody></table>");
	});
});
