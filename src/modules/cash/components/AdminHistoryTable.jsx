import React, { useState, useMemo, useCallback } from "react";
import {
	Search,
	Filter,
	Calendar,
	DollarSign,
	Package,
	ChevronDown,
	ChevronUp,
	CreditCard,
	Receipt,
	Upload,
	Eye,
	Loader2,
	Banknote,
} from "lucide-react";
import { getOrderPaymentDisplayLabel, getOrderPaymentPreferenceHint, isOrderPaymentDeferred, getOrderTileKind, resolveItemKitchenNote, isLegacyGlobalKitchenNote } from "@/shared/utils/orderUtils";
import { useOrderMoney } from "@/modules/cash/hooks/useOrderMoney";
import { useAdmin } from "@/modules/cash/admin/pages/AdminProvider";
import ReportPeriodSelect from "./ReportPeriodSelect";
import { ymdLocal } from "../utils/reportPeriodRange";
import DeliveryMotoIcon from "./DeliveryMotoIcon";
import { Button } from "@/components/ui/button";
import { isStorageObjectReference } from "@/shared/utils/supabaseStorage";
import CloseTableModal from "./CloseTableModal";

function formatDayHeading(ymd) {
	const d = new Date(`${ymd}T12:00:00`);
	return d.toLocaleDateString("es-CL", {
		weekday: "long",
		day: "numeric",
		month: "short",
	});
}

function SessionBadge({ order }) {
	const kind = getOrderTileKind(order);
	const n = order.shift_sequence ?? "—";
	if (kind === "moto") {
		return (
			<span className="admin-history-session admin-history-session--moto" title={`Moto #${n}`}>
				<DeliveryMotoIcon size={16} />
				<span>#{n}</span>
			</span>
		);
	}
	return (
		<span className="admin-history-session admin-history-session--mesa" title={`Mesa #${n}`}>
			#{n}
		</span>
	);
}

const AdminHistoryTable = ({
	orders = [],
	historyLoading = false,
	historyPeriod = "week",
	onPeriodChange,
	setReceiptModalOrder,
}) => {
	const { formatMoney, formatOrderAmount } = useOrderMoney();
	const { hydrateOrderItems, showNotify, markOrderSessionPaid, selectedBranch } = useAdmin();
	const [searchTerm, setSearchTerm] = useState("");
	const [filterStatus, setFilterStatus] = useState("all");
	const [expandedRows, setExpandedRows] = useState(new Set());
	const [hydratingOrderIds, setHydratingOrderIds] = useState(new Set());
	const [paymentOrder, setPaymentOrder] = useState(null);

	const toggleRow = useCallback(async (order) => {
		const id = order.id;
		const newSet = new Set(expandedRows);
		const willExpand = !newSet.has(id);
		if (willExpand) {
			newSet.add(id);
			setExpandedRows(newSet);
			const hasItems = Array.isArray(order.items) && order.items.length > 0;
			if (!hasItems && hydrateOrderItems) {
				setHydratingOrderIds((prev) => new Set(prev).add(id));
				try {
					await hydrateOrderItems(id);
				} catch {
					showNotify?.("No se pudieron cargar los productos del pedido", "error");
				} finally {
					setHydratingOrderIds((prev) => {
						const next = new Set(prev);
						next.delete(id);
						return next;
					});
				}
			}
		} else {
			newSet.delete(id);
			setExpandedRows(newSet);
		}
	}, [expandedRows, hydrateOrderItems, showNotify]);

	const filteredOrders = useMemo(() => {
		return (orders || []).filter((o) => {
			const matchesSearch =
				String(o.display_name || o.client_name || "")
					.toLowerCase()
					.includes(searchTerm.toLowerCase()) ||
				String(o.client_phone || "").includes(searchTerm) ||
				String(o.shift_sequence ?? "").includes(searchTerm);

			const matchesStatus = filterStatus === "all" || o.status === filterStatus;

			return matchesSearch && matchesStatus;
		});
	}, [orders, searchTerm, filterStatus]);

	const groupedByDay = useMemo(() => {
		const map = new Map();
		for (const o of filteredOrders) {
			const key = ymdLocal(new Date(o.updated_at ?? o.created_at));
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(o);
		}
		return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
	}, [filteredOrders]);

	const getStatusConfig = (status) => {
		const statusMap = {
			picked_up: { label: "Entregado", className: "success" },
			completed: { label: "Completado", className: "success" },
			active: { label: "En Cocina", className: "warning" },
			cancelled: { label: "Cancelado", className: "danger" },
			pending: { label: "Pendiente", className: "neutral" },
		};
		return statusMap[status] || { label: status, className: "neutral" };
	};

	return (
		<div className="history-view glass animate-fade">
			<div className="clients-header">
				<p className="admin-history-subtitle admin-history-meta">
					{historyLoading ? "Cargando historial…" : `${filteredOrders.length} pedidos encontrados`}
				</p>

				<div className="clients-actions">
					<ReportPeriodSelect
						value={historyPeriod}
						onChange={onPeriodChange}
						className="admin-history-period-select"
						aria-label="Periodo del historial"
						icon={<Calendar size={16} aria-hidden />}
					/>

					<div className="search-box">
						<Search size={18} className="admin-history-icon-muted" aria-hidden />
						<input
							type="text"
							placeholder="Buscar por cliente, teléfono o #…"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
						/>
					</div>

					<div className="select-wrapper">
						<Filter size={16} className="admin-history-icon-muted" aria-hidden />
						<select
							value={filterStatus}
							onChange={(e) => setFilterStatus(e.target.value)}
							aria-label="Filtrar por estado"
						>
							<option value="all">Todos los estados</option>
							<option value="completed">Completados</option>
							<option value="picked_up">Entregados</option>
							<option value="cancelled">Cancelados</option>
						</select>
					</div>
				</div>
			</div>

			{historyLoading ? (
				<div className="admin-history-loading" role="status">
					<Loader2 size={24} className="animate-spin" aria-hidden />
					<span>Cargando pedidos del periodo…</span>
				</div>
			) : null}

			<div className="history-table-wrapper">
				{groupedByDay.length === 0 && !historyLoading ? (
					<p className="admin-history-empty-block">No hay pedidos que coincidan con los filtros.</p>
				) : (
					groupedByDay.map(([dayKey, dayOrders]) => (
						<section key={dayKey} className="admin-history-day-group">
							<h3 className="admin-history-day-group__title">{formatDayHeading(dayKey)}</h3>
							<table className="data-table">
								<thead>
									<tr>
										<th>#</th>
										<th>CLIENTE</th>
										<th>FECHA Y HORA</th>
										<th>TIPO PAGO</th>
										<th>TOTAL</th>
										<th>ESTADO</th>
										<th className="admin-history-th-actions">ACCIONES</th>
									</tr>
								</thead>
								<tbody>
									{dayOrders.map((o) => {
										const st = getStatusConfig(o.status);
										const isExpanded = expandedRows.has(o.id);
										const itemsHydrating = hydratingOrderIds.has(o.id);
										const closedAt = o.updated_at ?? o.created_at;
										return (
											<React.Fragment key={o.id}>
												<tr
													className={`clickable-row${isExpanded ? " admin-history-row-expanded" : ""}`}
													onClick={() => toggleRow(o)}
												>
													<td data-label="#">
														<SessionBadge order={o} />
													</td>
													<td data-label="Cliente">
														<div className="admin-history-client-stack">
															<span className="admin-history-client-name">
																{o.display_name || o.client_name}
															</span>
															{o.client_phone ? (
																<span className="admin-history-muted-sm">
																	{o.client_phone}
																</span>
															) : null}
														</div>
													</td>
													<td data-label="Fecha y Hora">
														<div className="admin-history-date-row">
															<Calendar size={14} className="admin-history-icon-muted" aria-hidden />
															<span className="admin-history-date-main">
																{new Date(closedAt).toLocaleDateString()}
															</span>
															<span className="admin-history-muted-sm">
																{new Date(closedAt).toLocaleTimeString([], {
																	hour: "2-digit",
																	minute: "2-digit",
																})}
															</span>
														</div>
													</td>
													<td data-label="Tipo Pago">
														<div className="admin-history-payment-row">
															{o.payment_type === "online" ? (
																<Receipt size={14} className="admin-history-icon-muted" aria-hidden />
															) : o.payment_type === "tarjeta" ? (
																<CreditCard size={14} className="admin-history-icon-muted" aria-hidden />
															) : (
																<DollarSign size={14} className="admin-history-icon-muted" aria-hidden />
															)}
															<span className="admin-history-payment-label">
																{getOrderPaymentDisplayLabel(o)}
															</span>
														</div>
													</td>
													<td data-label="Total" className="admin-history-total">
														{formatOrderAmount({
															amountUsd: o.total,
															paymentMethod: o.payment_method_specific,
															order: o,
														})}
													</td>
													<td data-label="Estado">
														<span className={`status-badge ${st.className}`}>{st.label}</span>
													</td>
													<td data-label="Acciones" className="admin-history-actions">
														<Button variant="default" type="button" className="">
															{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
															{isExpanded ? "Cerrar" : "Detalles"}
														</Button>
													</td>
												</tr>

												{isExpanded ? (
													<tr className="history-expanded-row">
														<td colSpan="7" className="admin-history-expanded-td">
															<div className="history-expanded-content">
																<div className="admin-history-expanded-inner">
																	<h4 className="admin-history-section-title">
																		<Package size={14} aria-hidden />
																		Artículos del Pedido
																	</h4>
																	{itemsHydrating ? (
																		<div className="admin-history-loading" role="status">
																			<Loader2 size={18} className="animate-spin" aria-hidden />
																			<span>Cargando productos…</span>
																		</div>
																	) : (
																	<ul className="admin-history-items-list">
																		{o.items?.map((item, idx) => {
																			const itemNote = resolveItemKitchenNote(item, o.note);
																			return (
																			<li key={idx} className="admin-history-item-li">
																				<div className="admin-history-item-line">
																					<span>
																						<b>{item.quantity}x</b> {item.name}
																					</span>
																					<span className="admin-history-muted">
																						{formatMoney(item.price * item.quantity)}
																					</span>
																				</div>
																				{item.description ? (
																					<span className="admin-history-item-desc">
																						Detalle: {item.description}
																					</span>
																				) : null}
																				{itemNote ? (
																					<span className="admin-history-item-desc">
																						Nota: {itemNote}
																					</span>
																				) : null}
																			</li>
																			);
																		})}
																	</ul>
																	)}
																	{isLegacyGlobalKitchenNote(o) ? (
																		<div className="admin-history-note">
																			<span className="admin-history-note-label">
																				NOTA DEL CLIENTE:
																			</span>
																			<span className="admin-history-note-body">{o.note}</span>
																		</div>
																	) : null}
																</div>

																<div className="admin-history-receipt-panel">
																	<h4 className="admin-history-section-title">
																		<Receipt size={14} aria-hidden />
																		Comprobante
																	</h4>
																	{o.payment_type === "online" ? (
																		<div>
													{isStorageObjectReference(o.payment_ref, 'receipts') || o.payment_evidence_status === 'uploaded' ? (
														<div className="admin-history-receipt-actions">
															<Button variant="default" type="button"
																onClick={(e) => { e.stopPropagation(); setReceiptModalOrder?.(o); }}
																className="admin-history-receipt-link"
															>
																<Eye size={16} /> Ver Recibo Guardado
															</Button>
																					{setReceiptModalOrder ? (
																						<Button variant="default"
																							type="button"
																							onClick={(e) => {
																								e.stopPropagation();
																								setReceiptModalOrder(o);
																							}}
																							className="admin-history-receipt-btn-secondary"
																						>
																							Cambiar Recibo
																						</Button>
																					) : null}
																				</div>
																			) : (
																				<div className="admin-history-receipt-placeholder">
																					<span className="admin-history-receipt-muted">
																						No hay comprobante subido
																					</span>
																					{setReceiptModalOrder ? (
																						<Button variant="default"
																							type="button"
																							onClick={(e) => {
																								e.stopPropagation();
																								setReceiptModalOrder(o);
																							}}
																							className="admin-history-upload-btn"
																						>
																							<Upload size={14} /> Subir Comprobante
																						</Button>
																					) : null}
																				</div>
																			)}
																		</div>
																	) : isOrderPaymentDeferred(o) ? (
																		<div className="admin-history-receipt-info">
																			<span>
																				Pago pendiente de cobro en caja
																				{getOrderPaymentPreferenceHint(o)
																					? ` (${getOrderPaymentPreferenceHint(o)})`
																					: ""}
																				.
																			</span>
																			{o.status !== 'cancelled' ? (
																				<Button
																					variant="default"
																					type="button"
																					onClick={(event) => {
																						event.stopPropagation();
																						setPaymentOrder(o);
																					}}
																				>
																					<Banknote size={14} aria-hidden />
																					Registrar pago
																				</Button>
																			) : null}
																		</div>
																	) : (
																		<div className="admin-history-receipt-info">
																			Pago registrado como {getOrderPaymentDisplayLabel(o)}. No requiere
																			comprobante.
																		</div>
																	)}
																</div>
															</div>
														</td>
													</tr>
												) : null}
											</React.Fragment>
										);
									})}
								</tbody>
							</table>
						</section>
					))
				)}
			</div>
			{paymentOrder ? (
				<CloseTableModal
					isOpen
					intent="pay"
					order={paymentOrder}
					branch={selectedBranch}
					showNotify={showNotify}
					onClose={() => setPaymentOrder(null)}
					onConfirm={async (order, paymentPatch) => {
						const result = await markOrderSessionPaid(order, paymentPatch);
						if (result) setPaymentOrder(null);
						return Boolean(result);
					}}
				/>
			) : null}
		</div>
	);
};

export default AdminHistoryTable;
