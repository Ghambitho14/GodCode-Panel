# Hoja de cálculo (`plantilla-excel`) — boceto

Una hoja tipo Excel dentro del panel, sin todas sus funciones: columnas con letra (A, B… AA), filas con
número y fórmulas para sumar, restar, multiplicar y dividir. Nació del Excel de caja diaria de un
cliente (`referencia/2026 f.ods.zip`, con datos reales; no se sube a git, está en `.gitignore`).

## Qué se puede hacer

- Escribir texto, números (`62.500`, `1.250,50`, `1,5`) o fórmulas que empiezan con `=`.
- Fórmulas: `+ - * /`, paréntesis, signo negativo y celdas (`=A1+B1`, `=(A1-B1)*2`, `=b3/2`).
  `=SUMA(A1:A31)` suma un rango (también `SUM`, y varios argumentos con `;`: `=SUMA(A1:A5;C1)`).
- Una celda vacía vale 0; un texto dentro de una cuenta da `#VALOR!`; `SUMA` salta los textos.
- Errores en la celda: `#DIV/0!`, `#REF!` (celda fuera de la hoja), `#CICLO!` (la celda se usa a sí
  misma), `#ERROR!` (fórmula mal escrita).
- Teclado como en Excel: flechas, Enter, Tab; escribir reemplaza, doble clic o F2 edita, Esc cancela,
  Supr borra. Mientras se escribe una fórmula, un clic en otra celda pone su nombre.
- Varias hojas con pestañas abajo: **+** agrega, doble clic renombra, la × borra (nunca la última).
  Las fórmulas solo miran su propia hoja.
- «+10 filas» y «+1 columna» (hasta 1000 filas y 52 columnas, AZ). «CSV» baja la hoja abierta con
  los resultados, separada por `;` para Excel en español.
- Seleccionar: **Shift+clic** marca un bloque desde la celda activa, **Ctrl+clic** (Cmd en Mac) suma
  celdas o bloques sueltos, **arrastrar** con el mouse marca un bloque, clic en la letra o el número
  marca la columna o fila entera (también con Shift/Ctrl) y la esquina, toda la hoja. Teclado:
  Shift+flechas y Ctrl+A. En el celular: mantener apretado medio segundo y arrastrar.
- Formato (barra de abajo, aplica a todo lo marcado): **tamaño de letra** (11 es el normal, como en
  Excel), **negrita** (Ctrl+B), **cursiva** (Ctrl+I), **subrayado** (Ctrl+U), **tachado** (Ctrl+5),
  **alinear** izquierda / centro / derecha, **bordes** (todos, exterior, por lado o sin bordes),
  **Relleno** y **Color de letra** (paleta, «Sin relleno» / «Automático» y «Más colores…» con el
  selector del sistema). El botón se ve apretado si la celda activa lo tiene; apretarlo de nuevo lo
  quita. Supr borra el contenido y deja el formato. Una celda con relleno y sin color de letra se
  escribe en oscuro para que se lea.
- **Copiar, cortar y pegar** (Ctrl+C / Ctrl+X / Ctrl+V con la hoja enfocada):
  - Desde Excel, Google Sheets o LibreOffice llegan los valores, cada uno en su celda, y el formato
    que se pueda leer (negrita, cursiva, subrayado, tachado, tamaño, colores, alineación, bordes). De
    Excel llegan los resultados, no las fórmulas (Excel no las deja en el portapapeles del navegador).
  - Pega desde la celda activa y marca lo pegado; si no cabe, la hoja crece (hasta 1000 filas y AZ).
    Una sola celda copiada sobre varias marcadas las llena todas.
  - Copiado dentro de la hoja, las fórmulas se corren como en Excel (`=A2+B2` una fila más abajo queda
    `=A3+B3`; con `$` no se mueven). Cortar borra el origen al tiro y pega las fórmulas sin correrlas.
  - Hacia Excel va el resultado y el formato. Si hay varios bloques marcados, se copia el último.
  - Pegar varias celdas mientras se escribe en una pega el bloque desde esa celda.
- **Deshacer / rehacer** (Ctrl+Z / Ctrl+Y o los botones ↶ ↷): hasta 100 pasos, solo mientras la
  pantalla está abierta. Abrir otra hoja no cuenta como paso.
- Zoom con **−** / **+** (de 50 % a 200 %); tocar el porcentaje vuelve a 100 %. Se recuerda en ese
  navegador.

## Dónde se guarda

En Supabase, tabla `addon_data` (`addon = 'plantilla-excel'`, `key` = id de la sucursal): una hoja
por empresa y sucursal, la ven todos los de la empresa desde cualquier equipo. Se sube sola poco
después de cada cambio (arriba dice «Guardando…» / «Guardado 14:32»). Sin conexión queda en el
navegador y se sube al volver. Lo que había en el navegador de antes de la base se sube la primera
vez que se abre. Si dos personas editan la misma hoja a la vez, gana el último que guarda.

## Archivos

- `index.tsx` + `manifest.json`: sale en el menú como «Hoja de cálculo» (o el nombre del catálogo).
- `Screen.tsx`: toma empresa, sucursal y formato de números de `useAdmin()` y carga/guarda con
  `useAddonData` (`src/addons/`).
- `HojaCalculo.tsx` + `HojaCalculo.css`: la cuadrícula, la selección, la barra de formato y la de
  fórmula, copiar/pegar, deshacer y las pestañas (probado en `tests/addons/hoja-calculo-ui.test.tsx`).
- `ColorMenu.tsx` + `colores.ts`: el botón con la paleta y los colores de la paleta. `BordesMenu.tsx`:
  el menú de bordes. Los dos abren y cierran con `usePopover.ts`.
- `hoja-calculo.ts`: las fórmulas, el formato y el libro (sin React), probados en
  `tests/addons/hoja-calculo.test.ts`.
- `portapapeles.ts`: leer lo copiado (texto con tabulaciones y HTML de Excel, Sheets y LibreOffice) y
  armar lo que se copia, probado en `tests/addons/portapapeles.test.ts`.

Ojo en Windows: no nombres igual un `.ts` y un `.tsx` que solo cambian en mayúsculas (`hoja.ts` y
`Hoja.tsx`): `./Hoja` puede resolver al `.ts` equivocado.

## Lo que falta

1. Copiar solo el formato (brocha), ancho de columnas, combinar celdas.
2. Más funciones (PROMEDIO, SI…) y referencias entre hojas, si el cliente las pide.
3. Edición a la vez entre varias personas (hoy gana el último que guarda). Ojo al desplegar: una
   pestaña abierta con la versión anterior no conoce el formato nuevo y lo pierde si guarda.
4. Copiar y pegar con botones (hoy es con teclado; en el celular no hay Ctrl+C / Ctrl+V).
