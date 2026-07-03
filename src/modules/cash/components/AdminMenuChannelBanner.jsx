import React from 'react';
import { Info } from 'lucide-react';

/**
 * Banner según canal de pedidos del menú (`integration_settings.menu`).
 */
export default function AdminMenuChannelBanner({ menuCapabilities }) {
	if (!menuCapabilities) return null;

	const messages = [];
	if (menuCapabilities.showCatalogOnlyBanner) {
		messages.push('Menú en modo catálogo. Los clientes no pueden pedir desde la web.');
	}
	if (menuCapabilities.showWhatsAppOnlyBanner) {
		messages.push(
			'Pedidos del menú: solo WhatsApp. La cola de pedidos online no recibirá nuevos checkout.',
		);
	}
	if (menuCapabilities.showPanelOnlyBanner) {
		messages.push('Pedidos del menú: solo panel. No se abre WhatsApp al confirmar.');
	}

	if (messages.length === 0) return null;

	return (
		<div className="admin-menu-channel-banner glass" role="status">
			<Info size={18} aria-hidden className="admin-menu-channel-banner__icon" />
			<div className="admin-menu-channel-banner__text">
				{messages.map((msg) => (
					<p key={msg}>{msg}</p>
				))}
			</div>
		</div>
	);
}
