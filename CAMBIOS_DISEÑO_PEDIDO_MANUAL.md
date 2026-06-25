# Cambios de diseño — Pedido Manual (Paso 1)

Documento de registro de las mejoras visuales aplicadas al flujo de pedido manual, Paso 1 (catálogo + resumen).

## Librerías nuevas instaladas

| Librería | Uso |
|----------|-----|
| `tailwindcss` (v4) | Framework de utilidades CSS. |
| `@tailwindcss/postcss` | Plugin de PostCSS para Tailwind v4. |
| `framer-motion` | Animaciones (usado en `MagicCard` para glare/border glow). |
| `clsx` | Composición condicional de clases. |
| `tailwind-merge` | Merge de clases de Tailwind sin conflictos. |
| `class-variance-authority` | Variantes de componentes (preparado para futuros UI components). |

## Archivos de configuración creados / actualizados

| Archivo | Cambio |
|---------|--------|
| `postcss.config.js` | Configuración del plugin de Tailwind v4. |
| `components.json` | Configuración de shadcn/ui (sin CLI, referencia para componentes propios). |
| `src/styles/tailwind.css` | Tema Tailwind con tokens dinámicos del tenant/admin. |
| `src/lib/utils.ts` | Helper `cn()` para mergear clases con `clsx` + `tailwind-merge`. |

## Componentes UI creados

| Archivo | Descripción |
|---------|-------------|
| `src/components/ui/MagicCard.jsx` | Card con efectos de glare/borde glow que siguen el cursor. |
| `src/components/ui/Spotlight.jsx` | Efecto spotlight sobre el área de catálogo. |

## Componentes UI eliminados

- `src/components/ui/Card3D.jsx`
- `src/components/ui/CardHoverEffect.jsx`

> No se usaban en el flujo actual y fueron removidos para reducir deuda de código.

## Componentes del pedido manual modificados

### `src/modules/cash/components/manual-order/ProductCard.jsx`

- Card rediseñada al estilo moderno/minimalista:
  - Fondo blanco (`bg-white`).
  - Borde sutil `#f0f0f0`.
  - `border-radius: 3px`.
  - Sombra suave con hover elevado.
  - Padding interno `16px`.
  - Nombre en `text-base font-bold`.
  - Descripción en `#888` con tamaño reducido.
  - Precio en color primario/rojo del sistema (`text-gc-price`).
- Botón “+”:
  - Forma circular.
  - Sombra roja `0 2px 6px rgba(220,0,0,0.3)`.
  - Hover `scale(1.1)` + sombra más intensa.
  - Active `scale(0.95)`.
  - Transición `0.15s`.
- Se desactivaron los efectos glow/glare de `MagicCard` (`borderColor="transparent"`, `gradientColor="transparent"`) para mantener el look limpio.

### `src/modules/cash/components/manual-order/ManualOrderCatalog.jsx`

- Layout general:
  - Sidebar de categorías más grande: `w-64` (antes `w-52`).
  - Ítems de categoría más grandes: `px-4 py-3 text-sm`.
  - Título “Categorías” agrandado a `text-xs`.
  - Indicador lateral de categoría más alto (`h-5`).
- Área de catálogo:
  - Fondo cambiado a `#f0f0f0` para que las cards blancas resalten.
  - Padding interno aumentado: `p-6 sm:p-8`.
  - Gap entre cards: `gap-5`.
  - Separación entre secciones de categoría: `mb-12`.
  - Títulos de categoría: `text-base font-bold` con `mb-4`.

### `src/modules/cash/components/manual-order/OrderSummary.jsx`

- Panel lateral “Resumen Orden”:
  - Fondo `#fafafa`.
  - Cada ítem del carrito con card interna blanca, borde `#eee` y sombra mínima.
  - Separadores sutiles entre ítems.
  - Header y totales alineados al nuevo estilo claro.

### `src/modules/cash/components/ManualOrderModal.jsx`

- Sidebar del Paso 1 forzado a `!bg-[#fafafa]`.
- Botón “Siguiente” más prominente:
  - Altura mínima `44px`, padding lateral `24px`.
  - Sombra roja, hover con elevación y sombra intensificada.
- Body del modal con más separación: `p-5 gap-5`.

### `src/modules/cash/styles/ManualOrderModal.css`

- Limpieza de estilos del Paso 1 ya no utilizados (~1700 líneas removidas).
- Se conservaron los estilos del Paso 2 (checkout/cliente/pago) intactos.

## Tokens de color (Tailwind)

Definidos en `src/styles/tailwind.css`:

| Token Tailwind | Variable CSS | Fallback |
|----------------|--------------|----------|
| `gc-page` | `--admin-page-bg` | `#fbfbfd` |
| `gc-card` | `--admin-card-bg` | `#ffffff` |
| `gc-border` | `--admin-border` | `#e5e5ea` |
| `gc-text` | `--admin-text` | `#1d1d1f` |
| `gc-text-muted` | `--admin-text-muted` | `#6e6e73` |
| `gc-muted` | `--admin-icon-bg` | `#f5f5f7` |
| `gc-primary` | `--accent-primary` | `#111827` |
| `gc-primary-hover` | `--accent-hover` | `#111827` |
| `gc-price` | `--price-color` | `#ff4757` |
| `gc-discount` | `--discount-color` | `#25d366` |

> En el tenant real `--accent-primary` es el rojo del sistema, por lo que `gc-primary` y `gc-price` mantienen la identidad del panel.

## Validación

- `pnpm build` ✅ exitoso.
- `pnpm test` ✅ — 43 archivos, 261 tests passed, 3 skipped.

## Próximos pasos sugeridos (no aplicados)

- Rediseñar el Paso 2 (cliente, pago, checkout) con el mismo lenguaje visual.
- Convertir más componentes del Paso 2 a Tailwind para eliminar CSS legacy restante.
- Revisar comportamiento responsive en pantallas < 1024px tras el rediseño.
