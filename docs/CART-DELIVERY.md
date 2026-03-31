# Carrito / checkout: delivery — qué implementar en el front de tienda

Guía para alinear el **carrito público** (modal de pedido, checkout) con lo que ya valida el backend y el panel admin. El código de referencia del servidor vive en este repo; el carrito puede estar en la misma app o en otro cliente que consuma estas APIs.

---

## 1. Datos de sucursal que el carrito debe usar

Por sucursal seleccionada (`branchId`):

| Origen | Uso en carrito |
|--------|----------------|
| `delivery_settings` (JSONB en `branches`) | Reglas de precio, zonas, límites, texto de ayuda al cliente. |
| `enabled` | Si es `false`, no ofrecer envío a domicilio (solo retiro/local). |
| `deliveryPricingStrategy` | `"distance"` → cotizar por km / coordenadas. `"named_areas"` → lista de zonas o matching por dirección. |
| `namedAreaResolution` | `"manual_select"` → el usuario elige zona. `"address_matched"` → dirección en texto y el servidor resuelve zona. |
| `allowedPaymentMethodsForDelivery` | `null` = sin restricción extra. Si es un array, el checkout **solo** debe mostrar esos métodos (intersectando con los que la sucursal ya tiene activos + efectivo/tarjeta al recibir). |
| `customerNotes` | Mostrar como ayuda bajo el bloque de envío (mensaje configurado en el panel). |

**Nota:** En el contexto público no debe mostrarse ni guardarse en cliente el WhatsApp interno del repartidor (`trustedDriverWhatsApp`); el RPC público ya puede filtrar eso (patrón en `LocationContext`: `stripStaffOnlyDeliverySettings`).

Normalización útil (misma lógica que el servidor): `normalizeDeliverySettings` y `effectiveDeliveryPricingMode` en [`lib/delivery-settings.ts`](../lib/delivery-settings.ts).

---

## 2. Cotizar envío antes de pagar

### `POST /api/delivery-quote`

Cotización **pública** (sin auth). El cuerpo depende del modo:

**Subtotal**

- Siempre enviar `subtotal` coherente con la suma de ítems del carrito (mismo criterio que usará el pedido al cerrarse).

**Modo distancia** (`deliveryPricingStrategy` efectivo = distancia)

- `branchId`, `subtotal`, `lat`, `lng` (coordenadas del punto de entrega).
- El servidor calcula km respecto a `origin_lat` / `origin_lng` de la sucursal y aplica anillos / precio por km / mínimos / máximos / envío gratis.

**Modo zonas + lista manual** (`named_areas` + `manual_select`)

- `branchId`, `subtotal`, `namedAreaId` (id de la fila elegida en UI).

**Modo zonas + dirección** (`named_areas` + `address_matched`)

- `branchId`, `subtotal`, `address` (texto de dirección; el servidor resuelve zona y errores de ambigüedad / dirección corta).

Respuesta típica incluye `fee`, `waivedFreeShipping`, y en modos named datos extra (`namedAreaId`, `label`, etc.). Tratar códigos HTTP `400` / `409` con el mensaje `error` para mostrarlo al usuario.

---

## 3. Opcional: preview por dirección (geocoding acotado)

### `POST /api/delivery-geocode`

Pensado para **named_areas + address_matched**: sugiere / confirma zona a partir de texto de dirección, con **rate limit** y caché en servidor. Usar para autocompletado o paso intermedio; la cotización final de cierre puede seguir yendo a `delivery-quote` o al flujo de cierre de pedido.

---

## 4. Métodos de pago en delivery

- Lista “base” = métodos online configurados en la sucursal **más** opciones presenciales habituales (efectivo / tarjeta al recibir), según tu producto.
- Si `allowedPaymentMethodsForDelivery` no es `null`, filtrar la oferta del checkout a esa intersección.
- Función de referencia alineada con pedidos: `resolveDeliveryPaymentMethodsForCheckout` y `isOrderPaymentAllowedForDelivery` en [`lib/delivery-settings.ts`](../lib/delivery-settings.ts) (la creación de pedido en panel ya valida con la misma idea).

---

## 5. Flujo de pedido en dos tiempos (importante)

### Paso A — Crear pedido (RPC / transacción existente)

- El subtotal que envía el cliente a la RPC debe ser **solo ítems** (sin sumar todavía el envío), para que cuadre con la validación de precios en BD.
- El `total` almacenado justo después del alta puede ser **solo ítems** (comportamiento documentado en [`app/api/public-order-delivery/route.ts`](../app/api/public-order-delivery/route.ts)).

### Paso B — Cerrar envío: `POST /api/public-order-delivery`

Llamar **después** de crear el pedido, con el `orderId` recién creado (ventana corta: pedido `pending` y reciente).

**Cuerpo típico (delivery):**

- `orderId`
- `orderType`: `delivery` / `envio` / `envío` / `despacho` (normaliza el servidor)
- `deliveryFee`: debe coincidir con la tarifa **recalculada en servidor** (tolerancia pequeña, ver `FEE_EPS` en la ruta)
- `deliveryAddress`: objeto (dirección, referencias, etc.)
- Según modo:
  - Distancia: `deliveryLat`, `deliveryLng` y/o `deliveryKm` (el servidor puede recalcular km con Haversine si hay coords válidas)
  - Zonas manual: `namedAreaId`
  - Zonas por dirección: `deliveryAddress` con línea de dirección coherente con lo usado en cotización

El servidor:

1. Recalcula la tarifa con `computeDeliveryFee` + reglas de la sucursal.
2. Compara `deliveryFee` del cliente con la esperada.
3. Acepta `total` del pedido = **solo ítems** *o* **ítems + envío** (para cerrar el envío y actualizar `total`).

Respuesta incluye `delivery_fee`, `handoff_code` (código de verificación de envío), etc.

---

## 6. Checklist rápido para el carrito

- [ ] Leer `delivery_settings` de la sucursal y ocultar delivery si `enabled === false`.
- [ ] Mostrar mensaje de ayuda del campo `customerNotes` si viene con texto.
- [ ] Según `deliveryPricingStrategy` / `namedAreaResolution`, mostrar UI mínima:
  - mapa o selector de coords / dirección + cotización (**distance**),
  - lista de zonas (**named** + manual),
  - campo dirección + estados de error (**named** + address_matched).
- [ ] Cotizar con `POST /api/delivery-quote` al cambiar dirección, zona o subtotal (con debounce razonable).
- [ ] Filtrar métodos de pago con `allowedPaymentMethodsForDelivery` cuando aplique.
- [ ] Crear pedido con total coherente con ítems; luego llamar `POST /api/public-order-delivery` con la misma tarifa y datos de envío que el servidor puede reproducir.
- [ ] Manejar errores de `delivery-quote` / `public-order-delivery` (distancia máxima, pedido mínimo, zona no elegida, ambigüedad de dirección, tarifa inválida, total incoherente).

---

## 7. Archivos de referencia en este repo

| Ruta | Contenido |
|------|-----------|
| [`lib/delivery-settings.ts`](../lib/delivery-settings.ts) | Normalización, `computeDeliveryFee`, pagos delivery, subtotal de ítems. |
| [`app/api/delivery-quote/route.ts`](../app/api/delivery-quote/route.ts) | Contrato de cotización pública. |
| [`app/api/public-order-delivery/route.ts`](../app/api/public-order-delivery/route.ts) | Cierre de envío, validación de tarifa y total. |
| [`app/api/delivery-geocode/route.ts`](../app/api/delivery-geocode/route.ts) | Dirección → zona (con límites). |
| [`components/tenant/admin/kit/orders/services/orders.js`](../components/tenant/admin/kit/orders/services/orders.js) | Validación al crear pedido desde panel (delivery + pagos). |

---

## 8. Si el carrito vive en otro repositorio

Copiar o empaquetar solo lo necesario:

- Tipos / constantes de `delivery_settings` y funciones puras (`normalizeDeliverySettings`, `computeDeliveryFee`, filtro de pagos), **o**
- Duplicar la lógica mínima manteniendo el mismo contrato JSON y las mismas llamadas HTTP a las rutas anteriores.

La fuente de verdad de negocio sigue siendo **`branches.delivery_settings`** y las rutas API de este proyecto.
