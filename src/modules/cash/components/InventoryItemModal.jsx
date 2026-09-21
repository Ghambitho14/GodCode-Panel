import React, { useState, useEffect, useId } from "react";
import { X, Save, MapPin, Loader2 } from "lucide-react";
import { supabase, TABLES } from "@/integrations/supabase";
import { getInventoryUnitSelectGroups, getUnitLabel, normalizeUnit } from "@/lib/inventory-units";
import { useBranchMoney } from "@/modules/cash/hooks/useBranchMoney";
import { invalidateBranchInventory } from "@/modules/cash/services/panelDataCache";
import AdminHelpTip from "./AdminHelpTip";
import { Button } from "@/components/ui/button";

const ITEM_TYPES = [
	{ id: "kitchen", label: "General" },
	{ id: "beverage", label: "Bebida" },
	{ id: "sellable_extra", label: "Extra del carrito" },
	{ id: "other", label: "Otro" },
];

const TYPE_HELP =
	"Solo sirve para ordenar y filtrar la lista. General es materia prima; Bebida y Extra del carrito son los que además vendes sueltos en el carrito.";

const BEVERAGE_KIND_PRESETS = ["Agua", "Refresco", "Jugo natural", "Té y café", "Cerveza", "Otro"];

/** «Litro(s)» → «litro», para poder escribirlo dentro de una frase. */
function unitNoun(unit) {
	return getUnitLabel(unit).split("(")[0].trim().toLowerCase();
}

/** Evita NaN en inputs type="number" (React exige valor finito o cadena vacía). */
function finiteNum(n, fallback = 0) {
	const x = typeof n === "number" ? n : Number(n);
	return Number.isFinite(x) ? x : fallback;
}

const InventoryItemModal = ({
	isOpen,
	onClose,
	onItemSaved,
	itemToEdit = null,
	showNotify,
	branchId,
	branches,
	companyId,
	newItemPreset = null,
}) => {
	const { currency } = useBranchMoney();
	const beverageKindListId = `inv-bev-kind-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const [formData, setFormData] = useState({
		name: "",
		stock: 0,
		unit: "un",
		min_stock: 5,
		item_type: "kitchen",
		beverage_kind: "",
		cost_per_unit: 0,
		adjustment_note: "",
	});
	const [selectedBranchIds, setSelectedBranchIds] = useState([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (itemToEdit) {
			const it = itemToEdit.item_type && String(itemToEdit.item_type).trim() ? itemToEdit.item_type : "kitchen";
			setFormData({
				name: itemToEdit.name || "",
				stock: finiteNum(itemToEdit.stock, 0),
				unit: normalizeUnit(itemToEdit.unit || "un"),
				min_stock: finiteNum(itemToEdit.min_stock, 0),
				item_type: it,
				beverage_kind: itemToEdit.beverage_kind || "",
				cost_per_unit: finiteNum(itemToEdit.cost_per_unit, 0),
				adjustment_note: "",
			});
			if (branchId === "all") {
				const existing = Array.isArray(itemToEdit.branch_ids) ? itemToEdit.branch_ids : [];
				setSelectedBranchIds(
					existing.length > 0 ? existing : branches.filter((b) => b.id !== "all").map((b) => b.id),
				);
			} else {
				setSelectedBranchIds([branchId]);
			}
		} else {
			const presetName = newItemPreset?.name != null ? String(newItemPreset.name).trim() : "";
			const presetType =
				newItemPreset?.itemType && String(newItemPreset.itemType).trim()
					? String(newItemPreset.itemType).trim()
					: "kitchen";
			const presetBevKind =
				newItemPreset?.beverageKind != null ? String(newItemPreset.beverageKind).trim() : "";
			setFormData({
				name: presetName,
				stock: 0,
				unit: "un",
				min_stock: 5,
				item_type: presetType,
				beverage_kind: presetType === "beverage" ? presetBevKind : "",
				cost_per_unit: 0,
				adjustment_note: "",
			});
			if (branchId === "all") {
				setSelectedBranchIds(branches.filter((b) => b.id !== "all").map((b) => b.id));
			} else {
				setSelectedBranchIds([branchId]);
			}
		}
	}, [itemToEdit, isOpen, branchId, branches, newItemPreset]);

	if (!isOpen) return null;

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);

		if (!companyId) {
			showNotify("No hay empresa asociada para este inventario.", "error");
			setLoading(false);
			return;
		}

		try {
			let itemId = itemToEdit?.id;

			const item_type = ITEM_TYPES.some((t) => t.id === formData.item_type) ? formData.item_type : "kitchen";
			const beverage_kind =
				item_type === "beverage" && String(formData.beverage_kind || "").trim()
					? String(formData.beverage_kind).trim().slice(0, 64)
					: null;

			const itemData = {
				name: formData.name,
				unit: normalizeUnit(formData.unit),
				min_stock: finiteNum(formData.min_stock, 0),
				category: "", // Se elimina del UI, enviamos vacío
				cost_per_unit: finiteNum(formData.cost_per_unit, 0),
				item_type,
				beverage_kind,
				tags: [], // Se elimina del UI, enviamos vacío
			};

			const relevantBranches =
				branchId === "all"
					? branches.filter((b) => b.id !== "all" && selectedBranchIds.includes(b.id))
					: branches.filter((b) => b.id !== "all" && b.id === branchId);

			if (branchId === "all" && relevantBranches.length === 0) {
				showNotify("Selecciona al menos una sucursal.", "error");
				setLoading(false);
				return;
			}

			itemData.company_id = companyId || (relevantBranches[0] && relevantBranches[0].company_id);
			if (!itemData.company_id) {
				showNotify("No se pudo determinar la empresa del artículo.", "error");
				setLoading(false);
				return;
			}

			if (itemToEdit) {
				// Actualizar sin .select().single() que causa error 400
				const { error } = await supabase
					.from(TABLES.inventory_items)
					.update(itemData)
					.eq("id", itemId);
				
				if (error) {
					console.error("Error al actualizar artículo:", error);
					throw error;
				}
			} else {
				const { data, error } = await supabase.from(TABLES.inventory_items).insert([itemData]).select().single();
				if (error) throw error;
				itemId = data.id;
			}

			if (itemId && relevantBranches.length > 0) {
				/*
				 * Sin upsert: `on_conflict` pedia una restriccion unica sobre
				 * (inventory_item_id, branch_id) que inventory_branch no tiene y
				 * Postgres devolvia 42P10, asi que guardar un articulo fallaba
				 * despues de haber creado la ficha. Se busca la fila y se decide.
				 */
				for (const branch of relevantBranches) {
					const stockRow = {
						current_stock: finiteNum(formData.stock, 0),
						min_stock: finiteNum(formData.min_stock, 0),
					};
					const { data: existing, error: findError } = await supabase
						.from(TABLES.inventory_branch)
						.select("id")
						.eq("inventory_item_id", itemId)
						.eq("branch_id", branch.id)
						.maybeSingle();
					if (findError) throw findError;
					if (existing?.id) {
						const { error: stockError } = await supabase
							.from(TABLES.inventory_branch)
							.update(stockRow)
							.eq("id", existing.id);
						if (stockError) throw stockError;
					} else {
						const { error: stockError } = await supabase
							.from(TABLES.inventory_branch)
							.insert({ ...stockRow, inventory_item_id: itemId, branch_id: branch.id });
						if (stockError) throw stockError;
					}
					invalidateBranchInventory(branch.id);
				}
			}

			if (itemId && branchId !== "all" && companyId) {
				const next = finiteNum(formData.stock, 0);
				const prev = itemToEdit ? finiteNum(itemToEdit.stock, 0) : 0;
				const delta = next - prev;
				const note =
					(formData.adjustment_note && String(formData.adjustment_note).trim()) ||
					(itemToEdit ? "Ajuste manual" : "Stock inicial");
				if (!itemToEdit && next !== 0) {
					const { error: movErr } = await supabase.from(TABLES.inventory_movements).insert({
						company_id: companyId,
						branch_id: branchId,
						inventory_item_id: itemId,
						quantity_delta: next,
						movement_type: "adjustment",
						note,
						metadata: {},
					});
					if (movErr) console.warn("inventory_movements:", movErr);
				} else if (itemToEdit && delta !== 0) {
					const { error: movErr } = await supabase.from(TABLES.inventory_movements).insert({
						company_id: companyId,
						branch_id: branchId,
						inventory_item_id: itemId,
						quantity_delta: delta,
						movement_type: "adjustment",
						note,
						metadata: {},
					});
					if (movErr) console.warn("inventory_movements:", movErr);
				}
			}

			showNotify(itemToEdit ? "Artículo actualizado" : "Artículo creado", "success");
			if (typeof onItemSaved === "function") {
				onItemSaved({ id: itemId, isNew: !itemToEdit });
			}
			onClose();
		} catch (error) {
			console.error("inventory item save:", error);
			showNotify(error?.message || "Error al guardar artículo", "error");
		} finally {
			setLoading(false);
		}
	};

	const unitShort = getUnitLabel(formData.unit || "un", { short: true });
	const unitWord = unitNoun(formData.unit || "un");
	const branchList = branches.filter((b) => b.id !== "all");
	const singleBranchName =
		branchId !== "all" ? branchList.find((b) => b.id === branchId)?.name : null;

	return (
		<div className="modal-overlay" onClick={onClose} role="presentation">
			<div
				className="modal-content inventory-item-modal animate-scale-in"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="inventory-item-modal-title"
			>
				<header className="modal-header">
					<h3 id="inventory-item-modal-title">{itemToEdit ? "Editar artículo" : "Nuevo artículo"}</h3>
					<Button variant="default" type="button" onClick={onClose} className="btn-close" aria-label="Cerrar">
						<X size={22} />
					</Button>
				</header>

				<form onSubmit={handleSubmit}>
					<div className="modal-form-scroll inventory-item-form">
						<div className="form-group">
							<label htmlFor="inv-item-name">Nombre</label>
							<input
								id="inv-item-name"
								required
								className="form-input"
								value={formData.name}
								onChange={(e) => setFormData({ ...formData, name: e.target.value })}
								placeholder="Ej. Arroz grano corto"
								autoFocus
							/>
						</div>

						{/* La unidad va antes que la cantidad: se escribía «5» sin saber todavía
						    si eran unidades, kilos o cajas. */}
						<div className="inventory-form-row-2">
							<div className="form-group">
								<label htmlFor="inv-item-unit">Se mide en</label>
								<select
									id="inv-item-unit"
									className="form-select inventory-form-select"
									value={normalizeUnit(formData.unit)}
									onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
								>
									{getInventoryUnitSelectGroups().map((group) => (
										<optgroup key={group.groupLabel} label={group.groupLabel}>
											{group.options.map((opt) => (
												<option key={opt.value} value={opt.value}>
													{opt.label}
												</option>
											))}
										</optgroup>
									))}
								</select>
							</div>
							<div className="form-group">
								<label htmlFor="inv-item-type">
									Tipo
									<AdminHelpTip text={TYPE_HELP} />
								</label>
								<select
									id="inv-item-type"
									className="form-select inventory-form-select"
									value={formData.item_type}
									onChange={(e) =>
										setFormData({
											...formData,
											item_type: e.target.value,
											beverage_kind: e.target.value === "beverage" ? formData.beverage_kind : "",
										})
									}
								>
									{ITEM_TYPES.map((t) => (
										<option key={t.id} value={t.id}>
											{t.label}
										</option>
									))}
								</select>
							</div>
						</div>

						{formData.item_type === "beverage" ? (
							<div className="form-group">
								<label htmlFor="inv-beverage-kind">Tipo de bebida</label>
								<input
									id="inv-beverage-kind"
									className="form-input"
									list={beverageKindListId}
									value={formData.beverage_kind}
									onChange={(e) => setFormData({ ...formData, beverage_kind: e.target.value })}
									placeholder="Ej. Refresco"
									maxLength={64}
								/>
								<datalist id={beverageKindListId}>
									{BEVERAGE_KIND_PRESETS.map((p) => (
										<option key={p} value={p} />
									))}
								</datalist>
							</div>
						) : null}

						<div className="inventory-form-row-2">
							<div className="form-group">
								<label htmlFor="inv-item-stock">{itemToEdit ? "Cantidad actual" : "Cantidad inicial"}</label>
								<div className="inventory-field">
									<input
										id="inv-item-stock"
										type="number"
										step="any"
										className="inventory-field__input"
										value={formData.stock}
										onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
									/>
									<span className="inventory-field__affix" aria-hidden>
										{unitShort}
									</span>
								</div>
							</div>
							<div className="form-group">
								<label htmlFor="inv-item-min">Avisar por debajo de</label>
								<div className="inventory-field">
									<input
										id="inv-item-min"
										type="number"
										step="any"
										className="inventory-field__input"
										value={formData.min_stock}
										onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
									/>
									<span className="inventory-field__affix" aria-hidden>
										{unitShort}
									</span>
								</div>
							</div>
						</div>

						<div className="form-group inventory-form-cost">
							<label htmlFor="inv-item-cost">Costo por {unitWord} (opcional)</label>
							<div className="inventory-field">
								<span className="inventory-field__affix" aria-hidden>{currency}</span>
								<input
									id="inv-item-cost"
									type="number"
									className="inventory-field__input"
									min={0}
									step="any"
									value={formData.cost_per_unit}
									onChange={(e) => setFormData({ ...formData, cost_per_unit: e.target.value })}
								/>
							</div>
						</div>

						{/* Solo al editar: al crear, el movimiento se llama siempre «Stock inicial». */}
						{itemToEdit && branchId !== "all" ? (
							<div className="form-group">
								<label htmlFor="inv-item-note">Motivo del cambio (opcional)</label>
								<input
									id="inv-item-note"
									className="form-input"
									value={formData.adjustment_note}
									onChange={(e) => setFormData({ ...formData, adjustment_note: e.target.value })}
									placeholder="Ej. conteo físico, merma, donación…"
								/>
							</div>
						) : null}

						{branchId === "all" ? (
							<div className="form-group inventory-branch-field">
								<span className="inventory-branch-label" id="inv-branch-label">
									<MapPin size={16} className="text-accent" aria-hidden />
									Sucursales
								</span>
								<div className="inventory-branch-grid" role="group" aria-labelledby="inv-branch-label">
									{branchList.map((branch) => {
										const checked = selectedBranchIds.includes(branch.id);
										return (
											<label
												key={branch.id}
												className={`inventory-branch-option${checked ? " inventory-branch-option--checked" : ""}`}
											>
												<input
													type="checkbox"
													checked={checked}
													onChange={(e) => {
														if (e.target.checked) {
															setSelectedBranchIds([...selectedBranchIds, branch.id]);
														} else {
															setSelectedBranchIds(selectedBranchIds.filter((id) => id !== branch.id));
														}
													}}
												/>
												<span>{branch.name}</span>
											</label>
										);
									})}
								</div>
								{selectedBranchIds.length === 0 ? (
									<p className="inventory-branch-error">Selecciona al menos una sucursal.</p>
								) : null}
							</div>
						) : singleBranchName ? (
							<p className="inventory-branch-readonly">
								<MapPin size={14} aria-hidden /> Sucursal <strong>{singleBranchName}</strong>
							</p>
						) : null}
					</div>

					<footer className="modal-footer">
						<Button variant="secondary" type="button" onClick={onClose} className="" disabled={loading}>
							Cancelar
						</Button>
						<Button variant="default" type="submit" disabled={loading} className="">
							{loading ? (
								<>
									<Loader2 size={18} className="animate-spin" aria-hidden /> Guardando…
								</>
							) : (
								<>
									<Save size={18} aria-hidden /> Guardar
								</>
							)}
						</Button>
					</footer>
				</form>
			</div>
		</div>
	);
};

export default InventoryItemModal;
