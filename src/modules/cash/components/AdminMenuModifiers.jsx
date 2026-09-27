import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase, TABLES } from "@/integrations/supabase";
import { useBranchMoney } from "../hooks/useBranchMoney";
import { sameIngredient } from "../utils/modifierMatching";
import "../styles/AdminMenuModifiers.css";

/*
 * Armador de modificaciones ("Agregar cambios").
 * Árbol: grupo → acción → opción. Cada opción se vincula a sus insumos del inventario para
 * cruzarla con la receta: en la caja, «cambiar» parte de lo que el producto lleva y ofrece las
 * demás opciones del grupo. Cada grupo es una fila de `menu_modifier_groups` y se autoguarda.
 */

const ACTION_KEYS = ["quitar", "agregar", "cambiar"];
const DEFAULT_ACTION_LABELS = { quitar: "Quitar", agregar: "Agregar", cambiar: "Cambiar" };
const SCOPE_OPTIONS = [
	{ id: "all", label: "Toda la carta" },
	{ id: "categories", label: "Categorías" },
	{ id: "products", label: "Productos" },
];

let idSeq = 0;
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

function createGroup(name, optionNames = []) {
	const actions = {};
	for (const key of ACTION_KEYS) {
		actions[key] = { label: DEFAULT_ACTION_LABELS[key], enabled: true, items: {} };
	}
	return {
		id: crypto.randomUUID(),
		name,
		scope: "all",
		categoryIds: [],
		productIds: [],
		useRecipe: true,
		options: optionNames.map((optionName) => ({ id: newId("opt"), name: optionName })),
		actions,
	};
}

/** `rules`: { quitar|agregar|cambiar: [nombres] }; acción ausente = apagada. */
function createExampleGroup(name, optionNames, rules) {
	const group = createGroup(name, optionNames);
	const idByName = Object.fromEntries(group.options.map((o) => [o.name, o.id]));
	for (const key of ACTION_KEYS) {
		const rule = rules[key];
		group.actions[key].enabled = Boolean(rule);
		for (const optionName of rule ?? []) {
			group.actions[key].items[idByName[optionName]] = { enabled: true, price: 0 };
		}
	}
	return group;
}

/** El mismo árbol del primer boceto: relleno, plaqueta y proteína de un roll. */
function buildExampleGroups() {
	const relleno = ["Queso crema", "Cebollín", "Palta"];
	const plaqueta = ["Palta", "Queso crema", "Salmón", "Sésamo", "Ciboulette", "Frito (panko)"];
	const proteina = ["Pollo", "Salmón", "Camarón"];
	return [
		createExampleGroup("Relleno", relleno, { quitar: relleno, agregar: relleno, cambiar: relleno }),
		createExampleGroup("Plaqueta", plaqueta, { agregar: plaqueta, cambiar: plaqueta }),
		createExampleGroup("Proteína", proteina, { quitar: proteina, agregar: proteina, cambiar: proteina }),
	];
}

/**
 * Antes «cambiar» guardaba destinos por opción ({enabled, targets}); ahora cada opción activa
 * participa del cambio y su precio es lo que cuesta cambiar A ella.
 */
function normalizeActions(actions) {
	const merged = { ...createGroup("").actions, ...(actions ?? {}) };
	for (const [id, item] of Object.entries(merged.cambiar.items ?? {})) {
		if (item && !("price" in item)) merged.cambiar.items[id] = { enabled: Boolean(item.enabled), price: 0 };
	}
	return merged;
}

function Column({ title, children }) {
	return (
		<section className="admin-modifiers__col" aria-label={title}>
			<header className="admin-modifiers__col-head">{title}</header>
			<div className="admin-modifiers__col-body">{children}</div>
		</section>
	);
}

function Row({ label, meta, selected, muted, hasChildren, onClick }) {
	const className = [
		"admin-modifiers__row",
		selected ? "is-selected" : "",
		muted ? "is-muted" : "",
	].filter(Boolean).join(" ");
	return (
		<button type="button" className={className} aria-pressed={selected} onClick={onClick}>
			<span className="admin-modifiers__row-label">{label}</span>
			{meta ? <span className="admin-modifiers__row-meta">{meta}</span> : null}
			{hasChildren ? <ChevronRight size={14} aria-hidden className="admin-modifiers__row-chevron" /> : null}
		</button>
	);
}

function Hint({ children }) {
	return <p className="admin-modifiers__hint">{children}</p>;
}

/**
 * Borrador local por empresa: respaldo mientras la tabla no exista o no se pueda leer.
 * Cuando la base carga vacía y hay borrador, se sube una vez y se borra.
 */
const draftKey = (companyId) => `godcode-panel:${companyId || "local"}:modifiersDraft`;

function readDraft(companyId) {
	try {
		const parsed = JSON.parse(localStorage.getItem(draftKey(companyId)) || "[]");
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function writeDraft(companyId, groups) {
	try {
		if (groups) localStorage.setItem(draftKey(companyId), JSON.stringify(groups));
		else localStorage.removeItem(draftKey(companyId));
	} catch {
		/* sin almacenamiento: el borrador queda solo en memoria */
	}
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toRow = (companyId, group, sortOrder) => ({
	id: group.id,
	company_id: companyId,
	name: group.name,
	sort_order: sortOrder,
	scope: group.scope,
	category_ids: group.categoryIds,
	product_ids: group.productIds,
	use_recipe: group.useRecipe,
	options: group.options,
	actions: group.actions,
});

const fromRow = (row) => ({
	id: row.id,
	name: row.name ?? "",
	scope: row.scope ?? "all",
	categoryIds: row.category_ids ?? [],
	productIds: row.product_ids ?? [],
	useRecipe: row.use_recipe !== false,
	options: Array.isArray(row.options) ? row.options : [],
	actions: normalizeActions(row.actions),
});

const SAVE_DELAY_MS = 700;
const STATUS_TEXT = {
	loading: "Cargando…",
	saving: "Guardando…",
	saved: "Guardado. Todavía no aparece en la caja ni en el menú.",
	error: "No se pudo guardar. Revisa la conexión; los cambios siguen en este navegador.",
	local: "Sin conexión con la base: se guarda solo en este navegador.",
};

export default function AdminMenuModifiers({ companyId, categories = [], products = [] }) {
	const { formatMoney, fractionDigits } = useBranchMoney();
	const [groups, setGroups] = useState(() => (companyId ? [] : readDraft(companyId)));
	const [status, setStatus] = useState(companyId ? "loading" : "local");
	const dirtyRef = useRef(new Set());
	const groupsRef = useRef(groups);
	useEffect(() => { groupsRef.current = groups; }, [groups]);
	const useDb = Boolean(companyId) && status !== "local" && status !== "loading";

	useEffect(() => {
		if (!companyId) return undefined;
		let cancelled = false;
		(async () => {
			const { data, error } = await supabase
				.from(TABLES.menu_modifier_groups)
				.select("*")
				.eq("company_id", companyId)
				.order("sort_order", { ascending: true });
			if (cancelled) return;
			if (error) {
				console.warn("[AdminMenuModifiers] sin tabla, uso borrador local", error);
				setGroups(readDraft(companyId));
				setStatus("local");
				return;
			}
			const draft = readDraft(companyId);
			if (data.length === 0 && draft.length > 0) {
				const uploaded = draft.map((g) => (UUID_RE.test(g.id) ? g : { ...g, id: crypto.randomUUID() }));
				setGroups(uploaded);
				uploaded.forEach((g) => dirtyRef.current.add(g.id));
				setStatus("saving");
				return;
			}
			setGroups(data.map(fromRow));
			setStatus("saved");
		})();
		return () => { cancelled = true; };
	}, [companyId]);

	const flush = useCallback(async () => {
		const ids = [...dirtyRef.current];
		dirtyRef.current.clear();
		const all = groupsRef.current;
		const rows = all
			.map((g, i) => (ids.includes(g.id) ? toRow(companyId, g, i) : null))
			.filter(Boolean);
		if (rows.length === 0) return;
		const { error } = await supabase.from(TABLES.menu_modifier_groups).upsert(rows);
		if (error) {
			console.error("[AdminMenuModifiers] error al guardar", error);
			ids.forEach((id) => dirtyRef.current.add(id));
			writeDraft(companyId, groupsRef.current);
			setStatus("error");
			return;
		}
		if (dirtyRef.current.size === 0) {
			writeDraft(companyId, null);
			setStatus("saved");
		}
	}, [companyId]);

	useEffect(() => {
		if (status === "local") {
			writeDraft(companyId, groups);
			return undefined;
		}
		if (!useDb || dirtyRef.current.size === 0) return undefined;
		setStatus("saving");
		const timer = setTimeout(() => { void flush(); }, SAVE_DELAY_MS);
		return () => clearTimeout(timer);
		// status fuera a propósito: el efecto reacciona a cambios en los grupos.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [groups, useDb, flush, companyId]);

	/* Al salir de la pestaña con cambios pendientes, se guardan igual. */
	useEffect(() => () => {
		if (dirtyRef.current.size > 0) void flush();
	}, [flush]);

	const markDirty = (...ids) => ids.forEach((id) => dirtyRef.current.add(id));
	const [selection, setSelection] = useState({ groupId: null, actionKey: null, optionId: null, level: null });
	const [productQuery, setProductQuery] = useState("");
	const [insumoQuery, setInsumoQuery] = useState("");
	const [inventoryItems, setInventoryItems] = useState([]);

	useEffect(() => {
		if (!companyId) return undefined;
		let cancelled = false;
		(async () => {
			const { data, error } = await supabase
				.from(TABLES.inventory_items)
				.select("id, name")
				.eq("company_id", companyId)
				.order("name", { ascending: true });
			if (!cancelled && !error) setInventoryItems(data ?? []);
		})();
		return () => { cancelled = true; };
	}, [companyId]);

	const group = groups.find((g) => g.id === selection.groupId) ?? null;
	const action = group && selection.actionKey ? group.actions[selection.actionKey] : null;
	const option = group?.options.find((o) => o.id === selection.optionId) ?? null;
	const priceStep = fractionDigits > 0 ? 1 / 10 ** fractionDigits : 1;

	const priceLabel = (price) => (Number(price) > 0 ? `+${formatMoney(price)}` : "Gratis");

	const updateGroup = (groupId, mutate) => {
		markDirty(groupId);
		setGroups((prev) => prev.map((g) => {
			if (g.id !== groupId) return g;
			const next = structuredClone(g);
			mutate(next);
			return next;
		}));
	};

	const select = (patch) => setSelection((prev) => ({ ...prev, ...patch }));

	const pickGroup = (groupId) => select({ groupId, actionKey: null, optionId: null, level: "group" });
	const pickAction = (actionKey) => select({ actionKey, optionId: null, level: "action" });
	const pickOption = (optionId) => {
		setInsumoQuery("");
		select({ optionId, level: "option" });
	};

	const addGroup = () => {
		const created = createGroup("Nuevo grupo");
		markDirty(created.id);
		setGroups((prev) => [...prev, created]);
		select({ groupId: created.id, actionKey: null, optionId: null, level: "group" });
	};

	const loadExample = () => {
		const example = buildExampleGroups();
		markDirty(...example.map((g) => g.id));
		setGroups((prev) => [...prev, ...example]);
		select({ groupId: example[0].id, actionKey: null, optionId: null, level: "group" });
	};

	const addOption = () => {
		if (!group) return;
		const created = { id: newId("opt"), name: "Nueva opción" };
		updateGroup(group.id, (g) => {
			g.options.push(created);
			// Nace activa en las tres acciones: antes solo en la abierta y «desaparecía» de las otras.
			for (const key of ACTION_KEYS) g.actions[key].items[created.id] = { enabled: true, price: 0 };
		});
		pickOption(created.id);
	};

	const deleteGroup = async () => {
		const removedId = group.id;
		if (!window.confirm(`¿Eliminar el grupo «${group.name || "Sin nombre"}»?`)) return;
		if (useDb) {
			const { error } = await supabase.from(TABLES.menu_modifier_groups).delete().eq("id", removedId);
			if (error) {
				console.error("[AdminMenuModifiers] error al eliminar", error);
				window.alert("No se pudo eliminar el grupo. Solo un administrador puede eliminar.");
				return;
			}
		}
		dirtyRef.current.delete(removedId);
		setGroups((prev) => prev.filter((g) => g.id !== removedId));
		setSelection({ groupId: null, actionKey: null, optionId: null, level: null });
	};

	const deleteOption = () => {
		updateGroup(group.id, (g) => {
			g.options = g.options.filter((o) => o.id !== option.id);
			for (const key of ACTION_KEYS) delete g.actions[key].items[option.id];
		});
		select({ optionId: null, level: "action" });
	};

	const setOptionEnabled = (enabled, actionKey = selection.actionKey) => {
		updateGroup(group.id, (g) => {
			const items = g.actions[actionKey].items;
			const current = items[option.id];
			if (current) current.enabled = enabled;
			else items[option.id] = { enabled, price: 0 };
		});
	};

	/** Insumos vinculados a la opción (compartidos por quitar, agregar y cambiar). */
	const setOptionInsumos = (mutate) => updateGroup(group.id, (g) => {
		const target = g.options.find((o) => o.id === option.id);
		const next = new Set(Array.isArray(target.inventoryItemIds) ? target.inventoryItemIds : []);
		mutate(next);
		target.inventoryItemIds = [...next];
	});

	const parsePrice = (raw) => Math.max(0, Number(raw) || 0);

	const filteredProducts = useMemo(() => {
		const q = productQuery.trim().toLowerCase();
		const list = q ? products.filter((p) => String(p.name ?? "").toLowerCase().includes(q)) : products;
		return list.slice(0, 60);
	}, [products, productQuery]);

	const breadcrumb = [group?.name, action?.label, option?.name].filter(Boolean);

	const renderDetail = () => {
		if (selection.level === "group" && group) {
			const toggleId = (field, id) => updateGroup(group.id, (g) => {
				g[field] = g[field].includes(id) ? g[field].filter((x) => x !== id) : [...g[field], id];
			});
			return (
				<>
					<label className="admin-modifiers__field">
						<span>Nombre del grupo</span>
						<input
							type="text"
							value={group.name}
							onChange={(e) => updateGroup(group.id, (g) => { g.name = e.target.value; })}
						/>
					</label>
					<div className="admin-modifiers__field">
						<span>Aplica a</span>
						<div className="admin-modifiers__chips" role="group" aria-label="Alcance del grupo">
							{SCOPE_OPTIONS.map((s) => (
								<button
									key={s.id}
									type="button"
									className={`filter-chip${group.scope === s.id ? " active" : ""}`}
									onClick={() => updateGroup(group.id, (g) => { g.scope = s.id; })}
								>
									{s.label}
								</button>
							))}
						</div>
					</div>
					{group.scope === "categories" ? (
						<div className="admin-modifiers__checklist">
							{categories.length === 0 ? <Hint>No hay categorías cargadas.</Hint> : null}
							{categories.map((c) => (
								<label key={c.id} className="admin-modifiers__check">
									<input
										type="checkbox"
										checked={group.categoryIds.includes(c.id)}
										onChange={() => toggleId("categoryIds", c.id)}
									/>
									<span>{c.name}</span>
								</label>
							))}
						</div>
					) : null}
					{group.scope === "products" ? (
						<div className="admin-modifiers__checklist">
							<input
								type="search"
								className="admin-modifiers__search"
								placeholder="Buscar producto…"
								value={productQuery}
								onChange={(e) => setProductQuery(e.target.value)}
								aria-label="Buscar producto"
							/>
							{filteredProducts.map((p) => (
								<label key={p.id} className="admin-modifiers__check">
									<input
										type="checkbox"
										checked={group.productIds.includes(p.id)}
										onChange={() => toggleId("productIds", p.id)}
									/>
									<span>{p.name}</span>
								</label>
							))}
						</div>
					) : null}
					<Hint>
						En la caja salen las acciones activas de este grupo. Quitar y cambiar parten de lo que el producto
						lleva en su receta (parte «{group.name || "grupo"}»); agregar ofrece todas las opciones.
					</Hint>
					<Button type="button" variant="secondary" className="admin-modifiers__danger" onClick={deleteGroup}>
						<Trash2 size={14} aria-hidden /> Eliminar grupo
					</Button>
				</>
			);
		}

		if (selection.level === "action" && action) {
			return (
				<>
					<label className="admin-modifiers__field">
						<span>Nombre visible</span>
						<input
							type="text"
							value={action.label}
							onChange={(e) => updateGroup(group.id, (g) => { g.actions[selection.actionKey].label = e.target.value; })}
						/>
					</label>
					<label className="admin-modifiers__check admin-modifiers__check--block">
						<input
							type="checkbox"
							checked={action.enabled}
							onChange={(e) => updateGroup(group.id, (g) => { g.actions[selection.actionKey].enabled = e.target.checked; })}
						/>
						<span>Acción activa en este grupo</span>
					</label>
					<Hint>Se puede renombrar; por ejemplo, «Sin» en vez de «Quitar».</Hint>
				</>
			);
		}

		if (selection.level === "option" && option && action) {
			const linkedIds = Array.isArray(option.inventoryItemIds) ? option.inventoryItemIds.map(String) : [];
			const itemById = new Map(inventoryItems.map((it) => [String(it.id), it]));
			const suggested = inventoryItems.filter((it) => !linkedIds.includes(String(it.id)) && sameIngredient(option.name, it.name));
			const q = insumoQuery.trim().toLowerCase();
			const searchResults = q
				? inventoryItems.filter((it) => !linkedIds.includes(String(it.id)) && String(it.name).toLowerCase().includes(q)).slice(0, 8)
				: [];
			return (
				<>
					<label className="admin-modifiers__field">
						<span>Nombre</span>
						<input
							type="text"
							value={option.name}
							onChange={(e) => updateGroup(group.id, (g) => {
								g.options.find((o) => o.id === option.id).name = e.target.value;
							})}
						/>
					</label>
					{/* Las tres acciones juntas: marcarlas una por una en cada columna hacía que una
					    opción quedara activa solo en quitar (o solo en agregar) sin que se notara. */}
					<div className="admin-modifiers__field">
						<span>Se puede</span>
						<div className="admin-modifiers__actions-list">
						{ACTION_KEYS.map((key) => {
							const item = group.actions[key].items[option.id];
							const on = Boolean(item?.enabled);
							const label = group.actions[key].label || DEFAULT_ACTION_LABELS[key];
							return (
								<div key={key} className="admin-modifiers__action-line">
									<label className="admin-modifiers__check">
										<input
											type="checkbox"
											checked={on}
											onChange={(e) => setOptionEnabled(e.target.checked, key)}
										/>
										<span title={group.actions[key].enabled ? undefined : "Esta acción está apagada en el grupo"}>
											{key === "cambiar" ? `${label} a esta` : label}
											{group.actions[key].enabled ? "" : " · apagada"}
										</span>
									</label>
									{on && key !== "quitar" ? (
										<input
											type="number"
											min="0"
											step={priceStep}
											className="admin-modifiers__price"
											aria-label={`Precio de ${label.toLowerCase()} ${option.name}`}
											value={item.price ?? 0}
											onChange={(e) => updateGroup(group.id, (g) => {
												g.actions[key].items[option.id].price = parsePrice(e.target.value);
											})}
										/>
									) : null}
								</div>
							);
						})}
						</div>
						<Hint>
							El precio de «cambiar a esta» es lo que cuesta cambiar a {option.name.toLowerCase() || "esta opción"}.
						</Hint>
					</div>

					<div className="admin-modifiers__field">
						<span>Insumos de la receta</span>
						<div className="admin-modifiers__chips" aria-label={`Insumos vinculados a ${option.name}`}>
							{linkedIds.length === 0 ? (
								<Hint>Sin vínculos: solo se compara por nombre con la receta.</Hint>
							) : null}
							{linkedIds.map((id) => (
								<button
									key={id}
									type="button"
									className="filter-chip active"
									title="Quitar vínculo"
									onClick={() => setOptionInsumos((s) => s.delete(id))}
								>
									{itemById.get(id)?.name ?? "Insumo eliminado"} ×
								</button>
							))}
						</div>
						{suggested.length > 0 ? (
							<div className="admin-modifiers__chips" aria-label="Insumos sugeridos">
								{suggested.map((it) => (
									<button
										key={it.id}
										type="button"
										className="filter-chip"
										onClick={() => setOptionInsumos((s) => s.add(String(it.id)))}
									>
										+ {it.name}
									</button>
								))}
							</div>
						) : null}
						<input
							type="search"
							className="admin-modifiers__search"
							placeholder="Buscar insumo del inventario…"
							value={insumoQuery}
							onChange={(e) => setInsumoQuery(e.target.value)}
							aria-label="Buscar insumo para vincular"
						/>
						{searchResults.map((it) => (
							<button
								key={it.id}
								type="button"
								className="admin-modifiers__row"
								onClick={() => {
									setOptionInsumos((s) => s.add(String(it.id)));
									setInsumoQuery("");
								}}
							>
								<span className="admin-modifiers__row-label">{it.name}</span>
								<Plus size={14} aria-hidden />
							</button>
						))}
					</div>
					<Hint>
						Ya cuentan los insumos con nombre parecido (Pollo = Pollo apanado). Vincula a mano los que se
						llaman distinto. El nombre y los insumos se comparten entre quitar, agregar y cambiar.
					</Hint>
					<Button type="button" variant="secondary" className="admin-modifiers__danger" onClick={deleteOption}>
						<Trash2 size={14} aria-hidden /> Eliminar opción
					</Button>
				</>
			);
		}

		return <Hint>Selecciona un grupo, una acción o una opción para editarla.</Hint>;
	};

	return (
		<div className="admin-modifiers">
			<div className="admin-toolbar admin-modifiers__toolbar">
				<p className="admin-modifiers__draft" role="status">
					<Info size={16} aria-hidden />
					{STATUS_TEXT[status]}
				</p>
				<div className="admin-modifiers__toolbar-actions">
					<Button type="button" variant="secondary" onClick={loadExample} disabled={status === "loading"}>
						Cargar ejemplo
					</Button>
					<Button type="button" onClick={addGroup} disabled={status === "loading"}>
						<Plus size={16} aria-hidden /> Nuevo grupo
					</Button>
				</div>
			</div>

			<nav className="admin-modifiers__breadcrumb" aria-label="Ruta seleccionada">
				{breadcrumb.length > 0
					? breadcrumb.map((part, i) => (
						<React.Fragment key={`${i}-${part}`}>
							{i > 0 ? <ChevronRight size={14} aria-hidden /> : null}
							<span>{part}</span>
						</React.Fragment>
					))
					: <span>Selecciona un grupo</span>}
			</nav>

			<div className="admin-modifiers__columns">
				<Column title="Grupos">
					{groups.length === 0 ? (
						<Hint>Todavía no hay grupos. Crea uno o carga el ejemplo.</Hint>
					) : null}
					{groups.map((g) => (
						<Row
							key={g.id}
							label={g.name || "Sin nombre"}
							meta={g.scope === "all" ? "Global" : null}
							selected={g.id === selection.groupId}
							hasChildren
							onClick={() => pickGroup(g.id)}
						/>
					))}
				</Column>

				<Column title="Acciones">
					{group ? ACTION_KEYS.map((key) => {
						const a = group.actions[key];
						const count = Object.values(a.items).filter((item) => item.enabled).length;
						return (
							<Row
								key={key}
								label={a.label || DEFAULT_ACTION_LABELS[key]}
								meta={a.enabled ? `${count} op.` : "Apagada"}
								selected={key === selection.actionKey}
								muted={!a.enabled}
								hasChildren
								onClick={() => pickAction(key)}
							/>
						);
					}) : <Hint>Elige un grupo.</Hint>}
				</Column>

				<Column title="Opciones">
					{group && action ? (
						<>
							{group.options.map((o) => {
								const item = action.items[o.id];
								const enabled = Boolean(item?.enabled);
								let meta = "—";
								if (enabled) meta = selection.actionKey === "quitar" ? "Sí" : priceLabel(item.price);
								return (
									<Row
										key={o.id}
										label={o.name || "Sin nombre"}
										meta={meta}
										selected={o.id === selection.optionId}
										muted={!enabled}
										onClick={() => pickOption(o.id)}
									/>
								);
							})}
							<button type="button" className="admin-modifiers__add" onClick={addOption}>
								<Plus size={14} aria-hidden /> Nueva opción
							</button>
						</>
					) : <Hint>Elige una acción.</Hint>}
				</Column>

				<Column title="Detalle">{renderDetail()}</Column>
			</div>
		</div>
	);
}
