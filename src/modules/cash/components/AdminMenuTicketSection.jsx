import React, { useCallback, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTicketHtml } from "@/modules/cash/admin/printing/ticketHtml";
import {
	CASHIER_TICKET_DESIGNS,
	TICKET_PREVIEW_FULFILLMENTS,
	buildTicketPreviewOrder,
	normalizeCashierTicketDesign,
} from "@/modules/cash/admin/printing/ticketDesigns";
import { branchSettingsService } from "@/modules/cash/services/branchSettingsService";

/**
 * Vista previa de un ticket en un iframe sin scripts. La altura se ajusta al contenido
 * para que se vea el ticket completo sin barra de desplazamiento propia.
 */
function TicketPreview({ html, title }) {
	const [height, setHeight] = useState(560);
	const fitHeight = useCallback((event) => {
		// Alto del body (no del documento, que nunca baja del alto actual del iframe).
		const body = event.currentTarget.contentDocument?.body;
		const next = body ? Math.ceil(body.getBoundingClientRect().height) : 0;
		if (next) setHeight(next + 8);
	}, []);
	return (
		<iframe
			className="admin-ticket-options__preview"
			title={title}
			srcDoc={html}
			sandbox="allow-same-origin"
			style={{ height }}
			onLoad={fitHeight}
		/>
	);
}

/** El mismo diseño en cada tipo de pedido (Retiro, Delivery), uno al lado del otro. */
function TicketPreviewPair({ tickets, titlePrefix }) {
	return (
		<span className="admin-ticket-options__pair">
			{tickets.map((ticket) => (
				<span key={ticket.id} className="admin-ticket-options__pair-item">
					<span className="admin-ticket-options__pair-label">{ticket.label}</span>
					<TicketPreview html={ticket.html} title={`${titlePrefix} · ${ticket.label}`} />
				</span>
			))}
		</span>
	);
}

/**
 * Opciones de sucursal › Ticket: muestra los diseños del ticket de caja con un pedido de
 * ejemplo (en Retiro y en Delivery) y deja elegir cuál imprime esta sucursal. La comanda
 * de cocina tiene un solo diseño y se muestra como referencia.
 */
export default function AdminMenuTicketSection({
	selectedBranch,
	companyName,
	logoUrl,
	company,
	showNotify,
	onSaved,
}) {
	const branchId = selectedBranch?.id ?? null;
	const branchReady = Boolean(branchId && branchId !== "all");
	const branchTicketDesign = selectedBranch?.manual_order_settings?.ticketDesign;
	const branchShowDeliveryCode = selectedBranch?.manual_order_settings?.ticketShowDeliveryCode === true;

	// Lo guardado en esta visita manda hasta que llegue el `branch` recargado; el padre
	// monta el componente con `key` por sucursal, así que al cambiar de sucursal se limpia.
	const [justSaved, setJustSaved] = useState(null);
	const [draft, setDraft] = useState(null);
	const [saving, setSaving] = useState(false);
	const saved = useMemo(
		() =>
			justSaved ?? {
				ticketDesign: normalizeCashierTicketDesign(branchTicketDesign),
				ticketShowDeliveryCode: branchShowDeliveryCode,
			},
		[justSaved, branchTicketDesign, branchShowDeliveryCode],
	);
	const current = useMemo(() => ({ ...saved, ...draft }), [saved, draft]);
	const setDraftField = useCallback((field, value) => {
		setDraft((prev) => ({ ...prev, [field]: value }));
	}, []);

	// Un pedido de ejemplo por tipo (Retiro, Delivery): cada diseño se ve en los dos, lado a lado.
	const previewOrders = useMemo(
		() =>
			TICKET_PREVIEW_FULFILLMENTS.map((fulfillment) => ({
				...fulfillment,
				order: buildTicketPreviewOrder({ currency: selectedBranch?.currency, fulfillment: fulfillment.id }),
			})),
		[selectedBranch?.currency],
	);
	const printOptions = useMemo(
		() => ({
			companyName: companyName ?? null,
			branchAddress: selectedBranch?.address ?? null,
			orderChannel: "PDV",
			branch: selectedBranch ?? null,
			company: company ?? null,
			// La vista refleja la casilla aunque todavía no se haya guardado.
			showDeliveryCode: current.ticketShowDeliveryCode,
		}),
		[companyName, selectedBranch, company, current.ticketShowDeliveryCode],
	);
	const branchName = String(selectedBranch?.name ?? "").trim() || "esta sucursal";

	const previews = useMemo(
		() =>
			CASHIER_TICKET_DESIGNS.map((design) => ({
				...design,
				tickets: previewOrders.map(({ id, label, order }) => ({
					id,
					label,
					html: buildTicketHtml(order, branchName, logoUrl ?? null, "cashier", {
						...printOptions,
						ticketDesign: design.id,
					}),
				})),
			})),
		[previewOrders, branchName, logoUrl, printOptions],
	);
	const kitchenTickets = useMemo(
		() =>
			previewOrders.map(({ id, label, order }) => ({
				id,
				label,
				html: buildTicketHtml(order, branchName, null, "kitchen", printOptions),
			})),
		[previewOrders, branchName, printOptions],
	);

	const dirty =
		current.ticketDesign !== saved.ticketDesign ||
		current.ticketShowDeliveryCode !== saved.ticketShowDeliveryCode;

	const handleSave = useCallback(async () => {
		if (!branchReady) return;
		setSaving(true);
		try {
			await branchSettingsService.saveTicketSettings(branchId, current);
			setJustSaved(current);
			setDraft(null);
			showNotify?.("Opciones de ticket guardadas", "success");
			onSaved?.();
		} catch (e) {
			showNotify?.(e instanceof Error ? e.message : "No se pudieron guardar las opciones de ticket", "error");
		} finally {
			setSaving(false);
		}
	}, [branchReady, branchId, current, showNotify, onSaved]);

	if (!branchReady) {
		return (
			<div className="admin-branch-options__card admin-menu-options-card">
				<div className="admin-branch-options__empty">
					<p>Elige una sucursal en el encabezado para ver y elegir el diseño del ticket.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-branch-options__card admin-menu-options-card admin-ticket-options">
			<div className="admin-branch-options__block">
				<h3 className="admin-branch-options__block-title">Ticket de caja</h3>
				<p className="admin-branch-options__block-hint">
					El que se lleva el cliente. Elige cómo se imprime en <strong>{branchName}</strong>; la vista
					usa un pedido de ejemplo, en retiro y en delivery.
				</p>
				<div className="admin-ticket-options__designs" role="radiogroup" aria-label="Diseño del ticket de caja">
					{previews.map((design) => {
						const selected = current.ticketDesign === design.id;
						return (
							<label
								key={design.id}
								className={`admin-ticket-options__design${selected ? " is-selected" : ""}`}
							>
								<span className="admin-ticket-options__design-head">
									<input
										type="radio"
										name="cashier-ticket-design"
										value={design.id}
										checked={selected}
										onChange={() => setDraftField("ticketDesign", design.id)}
									/>
									<span className="admin-ticket-options__design-text">
										<strong>
											{design.label}
											{design.id === saved.ticketDesign ? (
												<span className="admin-ticket-options__badge">En uso</span>
											) : null}
										</strong>
										<small>{design.description}</small>
									</span>
								</span>
								<TicketPreviewPair tickets={design.tickets} titlePrefix={`Vista previa del ticket ${design.label}`} />
							</label>
						);
					})}
				</div>
			</div>

			<div className="admin-branch-options__block">
				<h3 className="admin-branch-options__block-title">Delivery</h3>
				<label className="admin-ticket-options__check">
					<input
						type="checkbox"
						checked={current.ticketShowDeliveryCode}
						onChange={(e) => setDraftField("ticketShowDeliveryCode", e.target.checked)}
					/>
					<span>
						<strong>Imprimir el código de verificación</strong>
						<small>
							Es el código que el cliente le da al repartidor al recibir. Si va impreso, el repartidor
							lo puede leer en el ticket de la bolsa.
						</small>
					</span>
				</label>
			</div>

			<div className="admin-branch-options__block">
				<h3 className="admin-branch-options__block-title">Comanda de cocina</h3>
				<p className="admin-branch-options__block-hint">
					La que va a cocina, sin precios. Por ahora tiene un solo diseño.
				</p>
				<div className="admin-ticket-options__designs">
					<div className="admin-ticket-options__design admin-ticket-options__design--static">
						<TicketPreviewPair tickets={kitchenTickets} titlePrefix="Vista previa de la comanda de cocina" />
					</div>
				</div>
			</div>

			{dirty ? (
				<div className="admin-branch-options__dirty-bar">
					<span className="admin-branch-options__dirty-label">Cambios sin guardar</span>
					<div className="admin-branch-options__dirty-actions">
						<Button
							variant="ghost"
							type="button"
							size="sm"
							disabled={saving}
							onClick={() => setDraft(null)}
						>
							Descartar
						</Button>
						<Button variant="default" type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
							{saving ? (
								"Guardando…"
							) : (
								<>
									<Save size={14} strokeWidth={1.75} aria-hidden />
									Guardar
								</>
							)}
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
