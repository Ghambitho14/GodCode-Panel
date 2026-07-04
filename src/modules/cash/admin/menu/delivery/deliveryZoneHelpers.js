import { effectiveDeliveryPricingMode } from "@/lib/delivery-settings";

export const emptyDraft = () => ({
	pricePerKm: "",
	baseFee: "",
	minFee: "",
	maxFee: "",
	maxDeliveryKm: "",
	freeDeliveryFromSubtotal: "",
	minOrderSubtotal: "",
	customerNotes: "",
	trustedDriverWhatsApp: "",
	originLat: "",
	originLng: "",
	uberDirectStoreId: "",
	externalDeliveryDisplayText: "",
	exchangeRate: "",
});

export const emptyZoneRow = () => ({
	id: `z${Date.now()}`,
	radiusKm: "",
	feeFlat: "",
});

export const emptyNamedPlaceRow = () => ({
	id: `p${Date.now()}`,
	name: "",
	feeFlat: "",
	aliasesStr: "",
});

export const DELIVERY_PAYMENT_LABELS = {
	tienda: "Efectivo al recibir",
	tarjeta: "Tarjeta",
	paypal: "PayPal",
	stripe: "Stripe",
	pago_movil: "Pago móvil",
	zelle: "Zelle",
	transferencia_bancaria: "Transferencia",
};

/** Textos de ayuda al pasar el cursor (title) y para lectores de pantalla */
export const DELIVERY_TOOLTIPS = {
	removeDistanceRing:
		"Quita este anillo: si el pedido llega dentro del radio (km) desde el local, aplicas la tarifa fija de la fila. Si no entra en ningún anillo, se usa precio por km + cargo base. Si solo queda una fila, no se borra (evita lista vacía).",
	removeNamedZoneRow:
		"Quita esta zona: nombre en el checkout, tarifa de envío y alias opcionales. Debe quedar al menos una fila. No borra datos guardados hasta que pulses Guardar.",
	addDistanceRing:
		"Añade otro anillo: ordena por radio del más pequeño al más grande; el primero que cubra la distancia gana.",
	addNamedZone:
		"Añade otra zona con nombre, tarifa y alias (opcional). Máximo 40 filas.",
	headerSwitch:
		"Activa o desactiva el envío a domicilio para esta sucursal. Si está apagado, el cliente solo puede retirar o consumir en local; el resto de opciones queda bloqueado.",
	strategyIntro:
		"Elige una sola modalidad: por distancia, por zonas con nombre o Uber Direct / consultar con tienda (cotización opcional vía API).",
	strategyDistance:
		"Cobro por distancia en línea recta desde el local: precio por km, cargo base opcional y anillos con tarifa fija por radio.",
	strategyNamedAreas:
		"Cada zona (comuna, barrio…) tiene un precio de envío fijo; no se suma precio por km ni cargo base de la otra modalidad.",
	strategyExternal:
		"Uber Direct: con Store ID (esta sucursal) y credenciales OAuth a nivel empresa, el menú puede cotizar envío en tiempo real. Si desactivas “Mostrar monto”, el cliente solo ve texto. Client ID/Secret los configura GodCode en admin SaaS (Global de la empresa), no aquí.",
	uberStoreId:
		"Identificador del local de recogida en Uber para esta sucursal (no es el Client ID OAuth). Lo obtienes en el portal de Uber.",
	uberShowFee:
		"Activo: el cliente ve precio estimado de envío en el carrito. Apagado: solo texto informativo sin monto.",
	uberDisplayText:
		"Mensaje en checkout cuando no hay monto de envío o como texto de apoyo.",
	namedManual:
		"El cliente elige la zona en una lista al pagar. Útil cuando quieres nombres exactos y control total.",
	namedAddress:
		"El cliente escribe su dirección; el sistema intenta asignar zona y precio automáticamente (datos de mapa abiertos).",
	zonesCheckoutSection:
		"Define cómo el cliente indica su zona en el checkout: lista para elegir o detección automática desde la dirección escrita.",
	pricePerKm:
		"Se multiplica por los kilómetros de distancia cuando ningún anillo cubre el pedido (modalidad por distancia).",
	baseFee:
		"Suma fija que se añade al costo por km antes de aplicar mínimos, máximos o envío gratis por subtotal.",
	originLat:
		"Latitud del local para calcular distancia al cliente (modalidad por km). Formato decimal, ej. -33.4489.",
	originLng:
		"Longitud del local para calcular distancia al cliente (modalidad por km). Formato decimal, ej. -70.6693.",
	saveButton:
		"Guarda tarifas, zonas, métodos de pago permitidos en delivery, WhatsApp del repartidor y opciones avanzadas en el servidor.",
	preview:
		"Ejemplo de envío con valores actuales (distancia o primera zona y subtotal de ejemplo).",
	driverWhatsApp:
		"Número al que el equipo puede enviar el mensaje de envío desde el tablero (WhatsApp abre en la app; tú eliges el contacto).",
	minFee:
		"Piso del costo de envío si el cálculo quedara por debajo (opcional).",
	maxFee:
		"Tope máximo del costo de envío aunque el cálculo sea mayor (opcional).",
	maxDeliveryKm:
		"No se aceptan pedidos de delivery si la distancia supera este valor (modalidad por km).",
	freeDeliveryFromSubtotal:
		"Si el subtotal del carrito alcanza este monto, el envío sale $0 (salvo que otra regla lo impida).",
	minOrderSubtotal:
		"Subtotal mínimo para permitir un pedido con delivery.",
	customerNotes:
		"Texto breve que ve el cliente en el checkout de envío (tiempos, condiciones, etc.).",
	originLatNamed:
		"Opcional: ayuda a ordenar sugerencias al escribir nombres de zona (modalidad por zonas con nombre).",
	originLngNamed:
		"Opcional: junto con la latitud, mejora sugerencias de lugares cercanos al local.",
	paymentSection:
		"Restringe qué medios de pago puede elegir el cliente solo cuando el pedido es delivery.",
	distanceRingsHelp:
		"Opcional: si el pedido entra dentro del radio (km) desde el local, aplicas la tarifa fija de esa fila; si no encaja en ningún anillo, se usa precio por km + cargo base.",
	zoneRingRadius:
		"Distancia máxima en km desde el local: si el pedido cae dentro de este radio, se aplica la tarifa fija de la misma fila.",
	zoneRingFee:
		"Precio de envío completo cuando la distancia entra en este anillo (no se suma precio por km ni cargo base de otras filas).",
	namedZoneName:
		"Nombre que verá el cliente o que se intentará casar con la dirección, según el modo de checkout.",
	namedZoneFee: "Costo de envío fijo para esta zona (modalidad por zonas con nombre).",
	namedZoneAliases:
		"Sinónimos separados por coma para reconocer la misma zona (ej. abreviaturas o barrios cercanos).",
};

/** Tooltips por chip de método de pago (delivery) */
export const DELIVERY_PAYMENT_CHIP_TITLE = {
	tienda: "Permite pagar en efectivo al recibir el pedido en domicilio.",
	tarjeta: "Permite tarjeta al recibir o según tu configuración de métodos de pago.",
	paypal: "Permite PayPal en checkout si lo tienes activo en la sucursal.",
	stripe: "Permite Stripe en checkout si lo tienes activo en la sucursal.",
	pago_movil: "Permite pago móvil si lo tienes configurado en métodos de pago.",
	zelle: "Permite Zelle si lo tienes configurado en métodos de pago.",
	transferencia_bancaria: "Permite transferencia bancaria si la tienes activa en la sucursal.",
};

export function buildZonesPayload(zoneRows) {
	const out = [];
	for (const row of zoneRows) {
		const r = Number(String(row.radiusKm).replace(",", "."));
		const f = Number(String(row.feeFlat).replace(",", "."));
		if (!Number.isFinite(r) || r <= 0) continue;
		if (!Number.isFinite(f) || f < 0) continue;
		out.push({
			id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : `z${out.length}`,
			radiusKm: r,
			feeFlat: f,
		});
	}
	return out;
}

export function buildNamedPlacesPayload(namedPlaceRows) {
	const out = [];
	for (const row of namedPlaceRows) {
		const nm = String(row.name ?? "").trim();
		const f = Number(String(row.feeFlat).replace(",", "."));
		if (!nm) continue;
		if (!Number.isFinite(f) || f < 0) continue;
		const aliasesStr = String(row.aliasesStr ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.slice(0, 8);
		const o = {
			id:
				typeof row.id === "string" && row.id.trim()
					? row.id.trim()
					: `p${out.length}`,
			name: nm.slice(0, 120),
			feeFlat: f,
		};
		if (aliasesStr.length > 0) o.aliases = aliasesStr;
		out.push(o);
	}
	return out;
}

export function buildDeliveryPreviewText({ normalizedFromDraft, previewFee, branchMoney }) {
	if (normalizedFromDraft.deliveryPricingStrategy === "external") {
		if (previewFee.fee === -2) {
			return "Ejemplo no aplicable: subtotal inferior al pedido mínimo.";
		}
		if (previewFee.waivedFreeShipping) {
			return "Modalidad externa: el cliente no ve precio de envío (solo “Consultar con la tienda” o tu mensaje). En el ejemplo, umbral de envío gratis podría aplicar al total sin mostrar monto de delivery.";
		}
		if (normalizedFromDraft.showExternalDeliveryFeeAmount) {
			return "Uber Direct: con Store ID y credenciales de empresa, el menú cotiza el envío y muestra monto al cliente (requiere ubicación en el mapa).";
		}
		return "Uber Direct / externo: el cliente solo ve texto (sin monto de envío en checkout), p. ej. “Consultar con la tienda”.";
	}
	if (previewFee.fee < 0) {
		if (previewFee.fee === -1) {
			return "Ejemplo no aplicable: distancia fuera del máximo configurado.";
		}
		if (previewFee.fee === -2) {
			return "Ejemplo no aplicable: subtotal inferior al pedido mínimo.";
		}
		return "Ejemplo no aplicable.";
	}
	if (
		effectiveDeliveryPricingMode(normalizedFromDraft) === "named" &&
		normalizedFromDraft.namedAreas?.length > 0
	) {
		if (previewFee.waivedFreeShipping) {
			return `Ejemplo (primera zona, subtotal ${branchMoney.formatMoney(15000)}): envío gratuito por umbral.`;
		}
		return `Ejemplo (primera zona, subtotal ${branchMoney.formatMoney(15000)}): envío ≈ ${branchMoney.formatMoney(Math.round(previewFee.fee))}.`;
	}
	if (previewFee.waivedFreeShipping) {
		return `Ejemplo (3 km, subtotal ${branchMoney.formatMoney(15000)}): envío gratuito por umbral.`;
	}
	return `Ejemplo (3 km, subtotal ${branchMoney.formatMoney(15000)}): envío ≈ ${branchMoney.formatMoney(Math.round(previewFee.fee))}.`;
}
