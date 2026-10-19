import React, { useCallback, useEffect, useMemo, useState } from "react";
import { confirmDialog } from "../admin/utils/confirmDialog";
import { createPortal } from "react-dom";
import { Gift, Plus, Loader2, Pencil, Ban, CircleCheck, RefreshCw, X, Trash2, Star } from "lucide-react";
import { supabase, TABLES } from "@/integrations/supabase";
import { useBranchMoney } from "@/modules/cash/hooks/useBranchMoney";
import { fetchMenuClientAccountsCached } from "@/modules/cash/services/menuAccountsService";
import { useAdmin } from "@/modules/cash/admin/pages/AdminProvider";
import { canManageLoyaltyRewards } from "@/modules/cash/utils/loyaltyRewardPermissions";
import { Button } from "@/components/ui/button";
import CouponFormSelect from "@/modules/cash/components/CouponFormSelect";

/*
 * Recompensas por puntos: lo que el cliente con cuenta puede canjear en Mi Cuenta del
 * menú. Cada canje lo hace la función `redeem_loyalty_reward` de la base (GodCode,
 * sql/2026-10-13_loyalty_rewards.sql): descuenta los puntos y crea un cupón de un solo
 * uso ligado a esa cuenta. Aquí solo se arma la carta y se ven los canjes.
 *
 * Los cupones no se pueden atar a un producto: una recompensa de producto entrega un
 * cupón de monto fijo por su precio, con ese mismo mínimo de compra.
 *
 * CEO y admin crean o cambian recompensas; otro rol, solo si el super admin le dio
 * `loyalty_rewards.manage` (Configuración → Roles). Sin eso ve la carta y los canjes sin
 * acciones. La base pone la misma regla (GodCode, sql/2026-10-16_role_permissions.sql).
 */

const REDEMPTIONS_LIMIT = 50;
/** Las reglas para ganar puntos las arma el CEO en su cuenta GodCode (/cuenta › Mi menú). */
const ACCOUNT_MENU_URL = "https://www.godcode.me/cuenta?tab=menu";
const PRODUCT_RESULTS_LIMIT = 30;

const emptyDraft = () => ({
	id: "",
	title: "",
	description: "",
	points_cost: "100",
	kind: "discount",
	product_id: "",
	discount_type: "percent",
	discount_value: "10",
	min_order_subtotal: "",
	valid_days: "30",
	is_active: true,
});

/** Precio que paga hoy el cliente por el producto en esta sucursal. */
function productPrice(product) {
	if (!product) return 0;
	const discounted = Number(product.discount_price);
	if (product.has_discount && Number.isFinite(discounted) && discounted > 0) return discounted;
	const price = Number(product.price);
	return Number.isFinite(price) ? price : 0;
}

function redemptionStatus(row) {
	const coupon = Array.isArray(row.coupon) ? row.coupon[0] : row.coupon;
	if (row.status === "cancelled" || !coupon) return { label: "Anulado", tone: "neutral" };
	if (Number(coupon.redemptions_count) > 0) return { label: "Usado", tone: "closed" };
	if (coupon.is_active === false) return { label: "Anulado", tone: "neutral" };
	if (coupon.valid_until && new Date(coupon.valid_until).getTime() < Date.now()) {
		return { label: "Vencido", tone: "warning" };
	}
	return { label: "Disponible", tone: "success" };
}

export default function AdminLoyaltyRewards({ showNotify, companyId, products = [] }) {
	const { formatMoney, locale } = useBranchMoney();
	const { userRole, rolePermissions } = useAdmin();
	const canManage = canManageLoyaltyRewards(userRole, rolePermissions?.actions);
	const [rows, setRows] = useState([]);
	const [redemptions, setRedemptions] = useState([]);
	const [accounts, setAccounts] = useState([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [draft, setDraft] = useState(() => emptyDraft());
	const [formOpen, setFormOpen] = useState(false);
	const [productQuery, setProductQuery] = useState("");

	const cid = typeof companyId === "string" && companyId.trim() ? companyId.trim() : "";
	const editing = Boolean(draft.id);

	const load = useCallback(async () => {
		if (!cid) {
			setRows([]);
			setRedemptions([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const [rewardsRes, redemptionsRes] = await Promise.all([
				supabase
					.from(TABLES.loyalty_rewards)
					.select(
						"id, title, description, points_cost, kind, product_id, discount_type, discount_value, min_order_subtotal, valid_days, is_active, sort_order, created_at",
					)
					.eq("company_id", cid)
					.order("points_cost", { ascending: true }),
				supabase
					.from(TABLES.loyalty_redemptions)
					.select(
						"id, reward_title, points_cost, status, created_at, account_id, client_id, coupon:discount_coupons(code, valid_until, redemptions_count, is_active)",
					)
					.eq("company_id", cid)
					.order("created_at", { ascending: false })
					.limit(REDEMPTIONS_LIMIT),
			]);
			if (rewardsRes.error) throw rewardsRes.error;
			if (redemptionsRes.error) throw redemptionsRes.error;
			setRows(rewardsRes.data || []);
			setRedemptions(redemptionsRes.data || []);
		} catch (e) {
			showNotify?.(e.message || "Error al cargar las recompensas", "error");
		} finally {
			setLoading(false);
		}
	}, [cid, showNotify]);

	useEffect(() => {
		void load();
	}, [load]);

	// Los canjes son de cuentas del menú: su nombre sale de la cuenta ya descifrada.
	useEffect(() => {
		if (!cid) return undefined;
		let alive = true;
		void (async () => {
			const result = await fetchMenuClientAccountsCached(cid);
			if (alive) setAccounts(result.accounts);
		})();
		return () => {
			alive = false;
		};
	}, [cid]);

	const productsById = useMemo(() => {
		const map = new Map();
		(Array.isArray(products) ? products : []).forEach((p) => map.set(p.id, p));
		return map;
	}, [products]);

	const accountLabel = useCallback(
		(id) => {
			const account = accounts.find((a) => a.id === id);
			if (!account) return id ? `Cuenta ${String(id).slice(0, 8)}…` : "Cuenta eliminada";
			return account.fullName || `Cuenta ${String(id).slice(0, 8)}…`;
		},
		[accounts],
	);

	const resetForm = () => {
		setDraft(emptyDraft());
		setProductQuery("");
		setFormOpen(false);
	};

	useEffect(() => {
		if (!formOpen) return undefined;
		const onKey = (e) => {
			if (e.key === "Escape" && !saving) resetForm();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [formOpen, saving]);

	const startCreate = () => {
		if (!canManage) return;
		setDraft(emptyDraft());
		setProductQuery("");
		setFormOpen(true);
	};

	const startEdit = (row) => {
		if (!canManage) return;
		setDraft({
			id: row.id,
			title: String(row.title ?? ""),
			description: String(row.description ?? ""),
			points_cost: String(Number(row.points_cost ?? 0)),
			kind: row.kind === "product" ? "product" : "discount",
			product_id: row.product_id ? String(row.product_id) : "",
			discount_type: row.discount_type === "fixed_amount" ? "fixed_amount" : "percent",
			discount_value: String(Number(row.discount_value ?? 0)),
			min_order_subtotal: row.min_order_subtotal == null ? "" : String(Number(row.min_order_subtotal)),
			valid_days: row.valid_days == null ? "" : String(Number(row.valid_days)),
			is_active: row.is_active !== false,
		});
		setProductQuery("");
		setFormOpen(true);
	};

	/** Elegir un producto llena el cupón con su precio; el dueño lo puede ajustar. */
	const pickProduct = (product) => {
		const price = productPrice(product);
		setDraft((d) => ({
			...d,
			product_id: product.id,
			discount_type: "fixed_amount",
			discount_value: String(price),
			min_order_subtotal: String(price),
			title: d.title.trim() ? d.title : `${product.name} gratis`,
		}));
		setProductQuery("");
	};

	const productResults = useMemo(() => {
		const q = productQuery.trim().toLowerCase();
		if (!q) return [];
		return (Array.isArray(products) ? products : [])
			.filter((p) => String(p.name ?? "").toLowerCase().includes(q))
			.slice(0, PRODUCT_RESULTS_LIMIT);
	}, [products, productQuery]);

	const buildPayload = () => {
		const title = draft.title.trim();
		if (!title) throw new Error("El nombre de la recompensa es obligatorio.");
		if (title.length > 80) throw new Error("El nombre puede tener hasta 80 caracteres.");
		const description = draft.description.trim();
		if (description.length > 400) throw new Error("La descripción puede tener hasta 400 caracteres.");
		const points = Math.floor(Number(draft.points_cost));
		if (!Number.isFinite(points) || points <= 0) throw new Error("Los puntos deben ser un número mayor que 0.");
		const kind = draft.kind === "product" ? "product" : "discount";
		if (kind === "product" && !draft.product_id) throw new Error("Elige el producto de la recompensa.");
		const discountType = kind === "product" ? "fixed_amount" : draft.discount_type === "fixed_amount" ? "fixed_amount" : "percent";
		const value = Number(draft.discount_value);
		if (!Number.isFinite(value) || value <= 0) throw new Error("El valor del cupón debe ser mayor que 0.");
		if (discountType === "percent" && value > 100) throw new Error("El porcentaje no puede superar 100.");
		const minRaw = String(draft.min_order_subtotal ?? "").trim();
		const min = minRaw === "" ? null : Number(minRaw);
		if (min !== null && (!Number.isFinite(min) || min < 0)) throw new Error("La compra mínima no es válida.");
		const daysRaw = String(draft.valid_days ?? "").trim();
		const days = daysRaw === "" ? null : Math.floor(Number(daysRaw));
		if (days !== null && (!Number.isFinite(days) || days < 1 || days > 3650)) {
			throw new Error("Los días de validez van de 1 a 3650 (vacío = no vence).");
		}
		return {
			company_id: cid,
			title,
			description: description || null,
			points_cost: points,
			kind,
			product_id: kind === "product" ? draft.product_id : null,
			discount_type: discountType,
			discount_value: value,
			min_order_subtotal: min,
			valid_days: days,
			is_active: Boolean(draft.is_active),
		};
	};

	const submit = async () => {
		if (!cid || !canManage) return;
		setSaving(true);
		try {
			const payload = buildPayload();
			if (editing) {
				const { error } = await supabase.from(TABLES.loyalty_rewards).update(payload).eq("id", draft.id);
				if (error) throw error;
				showNotify?.("Recompensa actualizada.");
			} else {
				const { error } = await supabase.from(TABLES.loyalty_rewards).insert(payload);
				if (error) throw error;
				showNotify?.("Recompensa creada.");
			}
			resetForm();
			await load();
		} catch (e) {
			showNotify?.(e.message || "No se pudo guardar.", "error");
		} finally {
			setSaving(false);
		}
	};

	const toggleActive = async (row) => {
		if (!canManage) return;
		setSaving(true);
		try {
			const { error } = await supabase
				.from(TABLES.loyalty_rewards)
				.update({ is_active: !row.is_active })
				.eq("id", row.id);
			if (error) throw error;
			showNotify?.(!row.is_active ? "Recompensa activada." : "Recompensa desactivada.");
			await load();
		} catch (e) {
			showNotify?.(e.message || "Error al actualizar", "error");
		} finally {
			setSaving(false);
		}
	};

	const deleteReward = async (row) => {
		if (!canManage) return;
		if (!(await confirmDialog({ title: `¿Eliminar la recompensa "${row.title}"?`, text: "Los cupones ya canjeados siguen valiendo.", confirmLabel: "Eliminar", danger: true }))) return;
		setSaving(true);
		try {
			const { error } = await supabase.from(TABLES.loyalty_rewards).delete().eq("id", row.id);
			if (error) throw error;
			showNotify?.("Recompensa eliminada.");
			await load();
		} catch (e) {
			showNotify?.(e.message || "Error al eliminar la recompensa", "error");
		} finally {
			setSaving(false);
		}
	};

	const benefitLabel = (row) => {
		const product = row.kind === "product" ? productsById.get(row.product_id) : null;
		const value =
			row.discount_type === "percent" ? `${Number(row.discount_value)} %` : formatMoney(Number(row.discount_value));
		if (row.kind === "product") return `${product?.name ?? "Producto"} · cupón de ${value}`;
		return `${value} de descuento`;
	};

	if (!cid) {
		return (
			<p className="admin-toolbar-hint admin-coupons__empty-company">
				Selecciona una empresa válida para administrar recompensas.
			</p>
		);
	}

	const selectedProduct = draft.product_id ? productsById.get(draft.product_id) : null;

	const modal =
		formOpen &&
		createPortal(
			<div
				className="coupon-form-modal-overlay"
				onClick={() => {
					if (!saving) resetForm();
				}}
				role="presentation"
			>
				<div
					className="coupon-form-modal"
					role="dialog"
					aria-modal="true"
					aria-labelledby="reward-form-modal-title"
					onClick={(e) => e.stopPropagation()}
				>
					<div className="coupon-form-modal__header">
						<div className="coupon-form-modal__header-text">
							<h3 id="reward-form-modal-title">{editing ? "Editar recompensa" : "Nueva recompensa"}</h3>
						</div>
						<button
							type="button"
							className="coupon-form-modal__close"
							aria-label="Cerrar"
							disabled={saving}
							onClick={resetForm}
						>
							<X size={18} />
						</button>
					</div>

					<form
						id="reward-form"
						className="coupon-form-modal__body"
						onSubmit={(e) => {
							e.preventDefault();
							void submit();
						}}
					>
						<section className="coupon-form-modal__section" aria-labelledby="reward-sec-what">
							<h4 id="reward-sec-what" className="coupon-form-modal__section-title">
								Qué se canjea
							</h4>
							<div className="coupon-form-modal__grid coupon-form-modal__grid--2">
								<div className="coupon-form-modal__field">
									<label htmlFor="reward-kind">Tipo</label>
									<CouponFormSelect
										id="reward-kind"
										disabled={saving}
										value={draft.kind}
										placeholder="Tipo"
										onValueChange={(v) =>
											setDraft((d) => ({
												...d,
												kind: v,
												product_id: v === "product" ? d.product_id : "",
											}))
										}
										options={[
											{ value: "discount", label: "Descuento en el pedido" },
											{ value: "product", label: "Un producto del menú" },
										]}
									/>
								</div>
								<div className="coupon-form-modal__field">
									<label htmlFor="reward-points">Puntos que cuesta</label>
									<input
										id="reward-points"
										type="number" inputMode="decimal"
										min="1"
										step="1"
										disabled={saving}
										value={draft.points_cost}
										onChange={(e) => setDraft((d) => ({ ...d, points_cost: e.target.value }))}
									/>
									<span className="coupon-form-modal__hint">
										Cómo se ganan los puntos lo defines en tu cuenta GodCode (Mi menú).
									</span>
								</div>
							</div>

							{draft.kind === "product" ? (
								<div className="coupon-form-modal__field">
									<label htmlFor="reward-product-search">Producto</label>
									{selectedProduct ? (
										<div className="loyalty-rewards__picked">
											<span>
												<strong>{selectedProduct.name}</strong> · {formatMoney(productPrice(selectedProduct))}
											</span>
											<button
												type="button"
												className="admin-icon-btn admin-icon-btn--sm"
												title="Cambiar producto"
												disabled={saving}
												onClick={() => setDraft((d) => ({ ...d, product_id: "" }))}
											>
												<X size={14} aria-hidden />
											</button>
										</div>
									) : (
										<>
											<input
												id="reward-product-search"
												type="search"
												autoComplete="off"
												disabled={saving}
												placeholder="Buscar en el menú…"
												value={productQuery}
												onChange={(e) => setProductQuery(e.target.value)}
											/>
											{productResults.length > 0 ? (
												<ul className="loyalty-rewards__product-results" role="listbox">
													{productResults.map((p) => (
														<li key={p.id}>
															<button type="button" onClick={() => pickProduct(p)}>
																<span>{p.name}</span>
																<span>{formatMoney(productPrice(p))}</span>
															</button>
														</li>
													))}
												</ul>
											) : productQuery.trim() ? (
												<span className="coupon-form-modal__hint">Ningún producto coincide.</span>
											) : null}
										</>
									)}
									<span className="coupon-form-modal__hint">
										Se entrega como un cupón por el valor del producto, con ese mismo mínimo de compra. El cupón
										descuenta del pedido; no agrega el producto solo.
									</span>
								</div>
							) : null}

							<div className="coupon-form-modal__field">
								<label htmlFor="reward-title">Nombre</label>
								<input
									id="reward-title"
									type="text"
									maxLength={80}
									disabled={saving}
									value={draft.title}
									placeholder={draft.kind === "product" ? "Gyozas gratis" : "10% en tu próximo pedido"}
									onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
								/>
							</div>
							<div className="coupon-form-modal__field">
								<label htmlFor="reward-description">Descripción (opcional)</label>
								<textarea
									id="reward-description"
									className="loyalty-rewards__textarea"
									rows={3}
									maxLength={400}
									disabled={saving}
									value={draft.description}
									placeholder="Lo que verá el cliente en Mi Cuenta: condiciones, para qué sirve…"
									onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
								/>
							</div>
						</section>

						<section className="coupon-form-modal__section" aria-labelledby="reward-sec-coupon">
							<h4 id="reward-sec-coupon" className="coupon-form-modal__section-title">
								Cupón que recibe
							</h4>
							<div className="coupon-form-modal__grid coupon-form-modal__grid--2">
								{draft.kind === "discount" ? (
									<div className="coupon-form-modal__field">
										<label htmlFor="reward-discount-type">Descuento</label>
										<CouponFormSelect
											id="reward-discount-type"
											disabled={saving}
											value={draft.discount_type}
											placeholder="Descuento"
											onValueChange={(v) => setDraft((d) => ({ ...d, discount_type: v }))}
											options={[
												{ value: "percent", label: "Porcentaje" },
												{ value: "fixed_amount", label: "Monto fijo" },
											]}
										/>
									</div>
								) : null}
								<div className="coupon-form-modal__field">
									<label htmlFor="reward-value">
										{draft.kind === "discount" && draft.discount_type === "percent" ? "Porcentaje (%)" : "Monto del cupón"}
									</label>
									<input
										id="reward-value"
										type="number" inputMode="decimal"
										min="0"
										step="1"
										disabled={saving}
										value={draft.discount_value}
										onChange={(e) => setDraft((d) => ({ ...d, discount_value: e.target.value }))}
									/>
								</div>
								<div className="coupon-form-modal__field">
									<label htmlFor="reward-min">Compra mínima</label>
									<input
										id="reward-min"
										type="number" inputMode="decimal"
										min="0"
										disabled={saving}
										placeholder="Sin mínimo"
										value={draft.min_order_subtotal}
										onChange={(e) => setDraft((d) => ({ ...d, min_order_subtotal: e.target.value }))}
									/>
								</div>
								<div className="coupon-form-modal__field">
									<label htmlFor="reward-days">Válido por (días)</label>
									<input
										id="reward-days"
										type="number" inputMode="decimal"
										min="1"
										max="3650"
										disabled={saving}
										placeholder="No vence"
										value={draft.valid_days}
										onChange={(e) => setDraft((d) => ({ ...d, valid_days: e.target.value }))}
									/>
									<span className="coupon-form-modal__hint">Desde el canje. Vacío = no vence. Si vence, no se devuelven los puntos.</span>
								</div>
							</div>
						</section>

						<label className="coupon-form-modal__active">
							<input
								type="checkbox"
								checked={draft.is_active}
								disabled={saving}
								onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
							/>
							<span>
								<span className="coupon-form-modal__active-title">Recompensa activa</span>
								<span className="coupon-form-modal__active-desc">
									Si está desactivada, no aparece en Mi Cuenta y no se puede canjear.
								</span>
							</span>
						</label>
					</form>

					<div className="coupon-form-modal__footer">
						<Button variant="secondary" type="button" size="sm" disabled={saving} onClick={resetForm}>
							Cancelar
						</Button>
						<Button variant="default" type="submit" form="reward-form" size="sm" disabled={saving || loading}>
							{saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
							{saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear recompensa"}
						</Button>
					</div>
				</div>
			</div>,
			document.querySelector(".admin-layout") || document.body,
		);

	return (
		<div className="admin-coupons loyalty-rewards">
			<div className="admin-toolbar glass admin-coupons__toolbar">
				<p className="admin-toolbar-hint admin-coupons__toolbar-hint">
					Los clientes con cuenta en el menú canjean sus puntos en Mi Cuenta y reciben un cupón de un solo uso.
				</p>
				<div className="admin-coupons__toolbar-actions">
					<Button
						variant="secondary"
						type="button"
						size="sm"
						className="admin-coupons__refresh-btn"
						disabled={loading || saving}
						onClick={() => void load()}
					>
						<RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden />
						Actualizar
					</Button>
					{canManage ? (
						<Button variant="default" type="button" size="sm" disabled={saving || formOpen} onClick={startCreate}>
							<Plus size={16} aria-hidden />
							Nueva recompensa
						</Button>
					) : null}
				</div>
			</div>

			{canManage ? (
				<p className="admin-toolbar-hint loyalty-rewards__rule-hint">
					Cómo ganan puntos tus clientes (por gasto, por compra, por producto o por categoría) se define en tu{" "}
					<a href={ACCOUNT_MENU_URL} target="_blank" rel="noopener noreferrer">
						cuenta GodCode › Mi menú
					</a>
					.
				</p>
			) : (
				<p className="admin-toolbar-hint loyalty-rewards__rule-hint">
					Tu rol puede ver las recompensas, pero no crearlas ni cambiarlas.
				</p>
			)}

			{modal}

			<div className="glass staff-table-glass admin-staff-panel">
				{loading ? (
					<div className="admin-staff-loading admin-coupons__loading">
						<Loader2 size={32} className="animate-spin" aria-hidden />
					</div>
				) : rows.length === 0 ? (
					<div className="admin-coupons__empty">
						<Gift size={36} strokeWidth={1.4} aria-hidden />
						<p>Todavía no hay recompensas.</p>
						{canManage ? (
							<Button variant="default" type="button" size="sm" onClick={startCreate}>
								<Plus size={16} aria-hidden />
								Crear primera recompensa
							</Button>
						) : null}
					</div>
				) : (
					<div className="staff-table-wrapper admin-staff-table-wrap">
						<table className="staff-table admin-staff-table">
							<thead>
								<tr>
									<th>Recompensa</th>
									<th>Puntos</th>
									<th>Entrega</th>
									<th>Vence</th>
									<th>Estado</th>
									{canManage ? <th /> : null}
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => (
									<tr key={row.id}>
										<td>
											<strong>{row.title}</strong>
											{row.description ? <div className="loyalty-rewards__desc">{row.description}</div> : null}
										</td>
										<td>
											<span className="loyalty-rewards__points">
												<Star size={13} aria-hidden />
												{Number(row.points_cost).toLocaleString(locale)}
											</span>
										</td>
										<td>
											{benefitLabel(row)}
											{row.min_order_subtotal ? (
												<div className="loyalty-rewards__desc">Mínimo {formatMoney(Number(row.min_order_subtotal))}</div>
											) : null}
										</td>
										<td>{row.valid_days ? `${row.valid_days} días` : "No vence"}</td>
										<td>
											<span className={`status-badge ${row.is_active ? "success" : "neutral"}`}>
												{row.is_active ? "Activa" : "Inactiva"}
											</span>
										</td>
										{canManage ? (
											<td className="admin-coupons__actions-cell">
												<button
													type="button"
													className="admin-icon-btn admin-icon-btn--sm"
													title="Editar"
													disabled={saving}
													onClick={() => startEdit(row)}
												>
													<Pencil size={14} aria-hidden />
												</button>
												<button
													type="button"
													className="admin-icon-btn admin-icon-btn--sm"
													title={row.is_active ? "Desactivar" : "Activar"}
													disabled={saving}
													onClick={() => void toggleActive(row)}
												>
													{row.is_active ? <Ban size={14} aria-hidden /> : <CircleCheck size={14} aria-hidden />}
												</button>
												<button
													type="button"
													className="admin-icon-btn admin-icon-btn--sm"
													title="Eliminar"
													disabled={saving}
													onClick={() => void deleteReward(row)}
												>
													<Trash2 size={14} className="text-red-500" aria-hidden />
												</button>
											</td>
										) : null}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			<h3 className="loyalty-rewards__heading">Canjes recientes</h3>
			<div className="glass staff-table-glass admin-staff-panel">
				{loading ? null : redemptions.length === 0 ? (
					<p className="admin-staff-empty admin-coupons__panel-empty">
						Nadie ha canjeado puntos todavía.
					</p>
				) : (
					<div className="staff-table-wrapper admin-staff-table-wrap">
						<table className="staff-table admin-staff-table">
							<thead>
								<tr>
									<th>Fecha</th>
									<th>Cliente</th>
									<th>Recompensa</th>
									<th>Puntos</th>
									<th>Cupón</th>
									<th>Estado</th>
								</tr>
							</thead>
							<tbody>
								{redemptions.map((row) => {
									const coupon = Array.isArray(row.coupon) ? row.coupon[0] : row.coupon;
									const status = redemptionStatus(row);
									return (
										<tr key={row.id}>
											<td>
												{new Date(row.created_at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
											</td>
											<td>{accountLabel(row.account_id)}</td>
											<td>{row.reward_title}</td>
											<td>{Number(row.points_cost).toLocaleString(locale)}</td>
											<td>
												<strong>{coupon?.code ?? "—"}</strong>
											</td>
											<td>
												<span className={`status-badge ${status.tone}`}>{status.label}</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
