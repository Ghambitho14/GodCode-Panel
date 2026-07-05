import React from "react";
import { MessageCircle } from "lucide-react";

/**
 * @param {unknown} phone
 * @returns {string}
 */
export function normalizePhoneDigits(phone) {
	if (phone == null) return "";
	return String(phone).replace(/\D/g, "");
}

/**
 * @param {unknown} phone
 * @param {string} [defaultCountryCode='56'] prefijo país (Chile por defecto)
 * @returns {string | null}
 */
export function buildWhatsAppUrl(phone, defaultCountryCode = "56") {
	const clean = normalizePhoneDigits(phone);
	if (!clean) return null;
	const final = clean.startsWith(defaultCountryCode)
		? clean
		: `${defaultCountryCode}${clean}`;
	return `https://wa.me/${final}`;
}

/** Ícono monocromo para botón WhatsApp — wrapper de Lucide MessageCircle. */
export function WhatsAppGlyph({ className }) {
	return <MessageCircle size={20} className={className} aria-hidden focusable="false" />;
}
