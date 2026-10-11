import React, { useCallback, useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDesktopBridge } from "@/modules/cash/admin/printing/desktopBridge";
import { buildTicketHtml } from "@/modules/cash/admin/printing/ticketHtml";
import { buildTicketPreviewOrder } from "@/modules/cash/admin/printing/ticketDesigns";

/** Valor del select de cocina para "la misma que caja" (en la config es `null`). */
const SAME_AS_CASHIER = "__same_as_cashier__";

const TEST_LABEL = { cashier: "ticket de caja", kitchen: "comanda de cocina" };

/**
 * Un `<option>` para una impresora guardada que ya no está en la lista (desconectada
 * o renombrada): así el select no cambia en silencio a otra.
 */
function MissingPrinterOption({ name, printers }) {
	if (!name || printers.some((p) => p.name === name)) return null;
	return <option value={name}>{name} (no encontrada)</option>;
}

/**
 * Opciones de sucursal › Ticket, solo dentro de la app de escritorio (GodCode Caja):
 * en qué impresora de este computador sale cada ticket, directo y sin el diálogo.
 * Se guarda en el equipo, no en la sucursal, porque cada PC tiene sus impresoras.
 * En el navegador no se muestra.
 */
export default function DesktopPrinterSettings({ selectedBranch, companyName, logoUrl, company, showNotify }) {
	const [bridge] = useState(getDesktopBridge);
	const [printers, setPrinters] = useState([]);
	const [config, setConfig] = useState(null);
	const [refreshing, setRefreshing] = useState(false);
	const [testing, setTesting] = useState(null);

	useEffect(() => {
		if (!bridge) return undefined;
		let cancelled = false;
		Promise.all([bridge.getConfig(), bridge.listPrinters()])
			.then(([nextConfig, list]) => {
				if (cancelled) return;
				setConfig(nextConfig);
				setPrinters(Array.isArray(list) ? list : []);
			})
			.catch(() => {
				if (!cancelled) showNotify?.("No se pudieron leer las impresoras de este equipo", "error");
			});
		return () => {
			cancelled = true;
		};
	}, [bridge, showNotify]);

	const refreshPrinters = useCallback(async () => {
		setRefreshing(true);
		try {
			const list = await bridge.listPrinters();
			setPrinters(Array.isArray(list) ? list : []);
		} catch {
			showNotify?.("No se pudo actualizar la lista de impresoras", "error");
		} finally {
			setRefreshing(false);
		}
	}, [bridge, showNotify]);

	const save = useCallback(
		async (patch) => {
			const previous = config;
			setConfig((current) => ({ ...current, ...patch }));
			try {
				setConfig(await bridge.setConfig(patch));
				showNotify?.("Guardado en este equipo", "success");
			} catch {
				setConfig(previous);
				showNotify?.("No se pudo guardar la impresora", "error");
			}
		},
		[bridge, config, showNotify],
	);

	const printTest = useCallback(
		async (variant) => {
			setTesting(variant);
			try {
				const order = buildTicketPreviewOrder({ currency: selectedBranch?.currency });
				const branchName = String(selectedBranch?.name ?? "").trim() || "Prueba de impresión";
				const html = buildTicketHtml(order, branchName, variant === "cashier" ? logoUrl ?? null : null, variant, {
					companyName: companyName ?? null,
					branchAddress: selectedBranch?.address ?? null,
					orderChannel: "PDV",
					branch: selectedBranch ?? null,
					company: company ?? null,
				});
				const result = await bridge.printTicket({ html, variant, auto: false });
				if (result?.ok) {
					showNotify?.(`Prueba de ${TEST_LABEL[variant]} enviada a la impresora`, "success");
				} else if (result?.reason === "printer-not-found") {
					showNotify?.("No se encontró la impresora. Actualiza la lista y elígela de nuevo.", "error");
				} else {
					showNotify?.(`No se pudo imprimir${result?.reason ? `: ${result.reason}` : ""}`, "error");
				}
			} catch {
				showNotify?.("No se pudo imprimir la prueba", "error");
			} finally {
				setTesting(null);
			}
		},
		[bridge, selectedBranch, companyName, logoUrl, company, showNotify],
	);

	if (!bridge) return null;

	const defaultPrinter = printers.find((p) => p.isDefault);
	const printerLabel = (p) => (p.isDefault ? `${p.displayName} · predeterminada` : p.displayName);

	return (
		<div className="admin-branch-options__card admin-menu-options-card admin-desktop-printers">
			<div className="admin-branch-options__block">
				<h3 className="admin-branch-options__block-title">Impresora de este equipo</h3>
				<p className="admin-branch-options__block-hint">
					Los tickets salen directo por la impresora elegida, sin preguntar. Se guarda solo en este computador.
				</p>
				{config ? (
					<>
						<div className="admin-desktop-printers__row">
							<label className="admin-menu-options-field">
								<span className="admin-menu-options-field-label">Ticket de caja</span>
								<select
									className="form-input"
									value={config.cashierPrinter}
									onChange={(e) => void save({ cashierPrinter: e.target.value })}
								>
									<option value="">
										Predeterminada de Windows{defaultPrinter ? ` (${defaultPrinter.displayName})` : ""}
									</option>
									{printers.map((p) => (
										<option key={p.name} value={p.name}>
											{printerLabel(p)}
										</option>
									))}
									<MissingPrinterOption name={config.cashierPrinter} printers={printers} />
								</select>
							</label>
							<Button
								variant="outline"
								size="sm"
								type="button"
								disabled={testing !== null}
								onClick={() => void printTest("cashier")}
							>
								<Printer size={14} aria-hidden />
								{testing === "cashier" ? "Imprimiendo…" : "Probar"}
							</Button>
						</div>
						<div className="admin-desktop-printers__row">
							<label className="admin-menu-options-field">
								<span className="admin-menu-options-field-label">Comanda de cocina</span>
								<select
									className="form-input"
									value={config.kitchenPrinter ?? SAME_AS_CASHIER}
									onChange={(e) =>
										void save({ kitchenPrinter: e.target.value === SAME_AS_CASHIER ? null : e.target.value })
									}
								>
									<option value={SAME_AS_CASHIER}>La misma que caja</option>
									{printers.map((p) => (
										<option key={p.name} value={p.name}>
											{printerLabel(p)}
										</option>
									))}
									<MissingPrinterOption name={config.kitchenPrinter} printers={printers} />
								</select>
							</label>
							<Button
								variant="outline"
								size="sm"
								type="button"
								disabled={testing !== null}
								onClick={() => void printTest("kitchen")}
							>
								<Printer size={14} aria-hidden />
								{testing === "kitchen" ? "Imprimiendo…" : "Probar"}
							</Button>
						</div>
						<div>
							<Button
								variant="ghost"
								size="sm"
								type="button"
								disabled={refreshing}
								onClick={() => void refreshPrinters()}
							>
								<RefreshCw size={14} aria-hidden />
								{refreshing ? "Buscando…" : "Actualizar lista"}
							</Button>
						</div>
					</>
				) : (
					<p className="admin-branch-options__block-hint admin-branch-options__block-hint--muted">
						Buscando impresoras…
					</p>
				)}
			</div>

			{config ? (
				<div className="admin-branch-options__block">
					<label className="admin-ticket-options__check">
						<input
							type="checkbox"
							checked={config.autoPrint}
							onChange={(e) => void save({ autoPrint: e.target.checked })}
						/>
						<span>
							<strong>Imprimir automáticamente los pedidos nuevos en este equipo</strong>
							<small>
								Si el panel está abierto en varios computadores del local, déjalo marcado solo en uno para que
								cada pedido salga una vez.
							</small>
						</span>
					</label>
				</div>
			) : null}
		</div>
	);
}
