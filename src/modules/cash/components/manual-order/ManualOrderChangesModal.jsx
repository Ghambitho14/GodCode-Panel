import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, TABLES } from '@/integrations/supabase';
import { cn } from '@/lib/utils';
import { lineInPart, optionInLines } from '../../utils/modifierMatching';
import { changeSurcharge } from '../../utils/modifierPricing';
import { primaryActionButtonClass, textScale } from './manualOrderStyles';

/*
 * "Cambios" de una línea del pedido manual, paso a paso: grupo → acción → opción → (cambiar) por cuál.
 * Sale de los grupos del armador "Agregar cambios" (`menu_modifier_groups`): se ven todas sus acciones
 * activas. Con receta, quitar y «cambiar» parten de lo que el producto lleva en la parte del grupo
 * (cada opción se cruza por sus insumos vinculados, o por nombre), y «por cuál» ofrece todas las
 * demás opciones del grupo. El precio de cada cambio depende del modo de cobro del grupo (precio del
 * destino, o jerarquía: ver `utils/modifierPricing.js`). Cada cambio lleva cantidad (en una promo: a
 * cuántos rolls aplica).
 * Lo elegido se guarda en `item.extras` con `kind: 'change'`.
 */

const ACTION_ORDER = ['quitar', 'agregar', 'cambiar'];
const DEFAULT_LABELS = { quitar: 'Quitar', agregar: 'Agregar', cambiar: 'Cambiar' };
const MAX_CHANGE_QTY = 20;
const lower = (value) => String(value ?? '').trim().toLowerCase();

function groupApplies(group, item) {
	if (group.scope === 'categories') return (group.category_ids ?? []).map(String).includes(String(item.category_id ?? ''));
	if (group.scope === 'products') return (group.product_ids ?? []).map(String).includes(String(item.id));
	return true;
}

function changeName(actionLabel, groupName, optionName, targetName) {
	const base = `${actionLabel} ${lower(groupName)} de ${lower(optionName)}`;
	return targetName ? `${base} por ${lower(targetName)}` : base;
}

/**
 * Por grupo, sus acciones activas (siempre visibles) y qué se puede elegir en cada una.
 * Sin receta se ofrece todo lo configurado. Una acción sin nada elegible queda deshabilitada.
 */
function buildTree(groups, item, recipe) {
	const hasRecipe = recipe.length > 0;
	const hasParts = recipe.some((line) => line.part);
	const tree = [];
	for (const group of groups) {
		if (!groupApplies(group, item)) continue;
		const options = Array.isArray(group.options) ? group.options : [];
		const lines = hasParts
			? recipe.filter((line) => lineInPart(line, group.name))
			: recipe;
		const lleva = (option) => optionInLines(option, lines);

		const actions = [];
		for (const key of ACTION_ORDER) {
			const action = group.actions?.[key];
			if (!action?.enabled) continue;
			const label = action.label || DEFAULT_LABELS[key];
			const active = options.filter((o) => action.items?.[o.id]?.enabled);
			const priceOf = (o) => Number(action.items?.[o.id]?.price) || 0;
			/*
			 * Punto de partida de quitar/cambiar: solo opciones del grupo (con esa acción activa) que el
			 * producto lleva según su receta. Un ingrediente sin opción no aparece: se crea la opción.
			 */
			const froms = active
				.filter((o) => !hasRecipe || lleva(o))
				.map((o) => ({ id: o.id, name: o.name, optionId: o.id }));
			let choices;
			if (key === 'cambiar') {
				choices = froms.map((from) => ({
					option: from,
					inRecipe: hasRecipe,
					// Todas las demás opciones: en una promo con varios rolls «lo que ya lleva» también
					// es un destino válido (p. ej. dos rolls con plaqueta de salmón).
					targets: active
						.filter((to) => to.id !== from.optionId)
						.map((to) => ({
							key: `${group.id}:cambiar:${from.id}:${to.id}`,
							option: from,
							target: to,
							inRecipe: lleva(to),
							// Según el grupo: precio del destino, o la diferencia si cobra por jerarquía.
							price: changeSurcharge(action, from.optionId, to.id),
							name: changeName(label, group.name, from.name, to.name),
						})),
				}));
			} else if (key === 'quitar') {
				choices = froms.map((from) => ({
					key: `${group.id}:quitar:${from.id}`,
					option: from,
					inRecipe: hasRecipe,
					// Quitar también puede cobrar (p. ej. «sin nori $500»); sin precio es gratis.
					price: priceOf(from),
					name: changeName(label, group.name, from.name),
				}));
			} else {
				choices = active.map((o) => ({
					key: `${group.id}:${key}:${o.id}`,
					option: o,
					inRecipe: lleva(o),
					price: priceOf(o),
					name: changeName(label, group.name, o.name),
				}));
			}
			actions.push({ key, label, choices });
		}
		if (actions.length > 0) tree.push({ group, actions });
	}
	return tree;
}

function StepRow({ label, tag = null, meta, selected = false, hasChildren = false, disabled = false, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={selected || undefined}
			className={cn(
				'flex min-h-[52px] w-full items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
				textScale.body,
				selected
					? 'border-gc-accent bg-gc-accent/10 text-gc-accent'
					: 'border-gc-border bg-gc-card text-gc-text enabled:hover:border-gc-accent/40 enabled:hover:bg-gc-accent/5',
			)}
		>
			<span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
			{tag ? (
				<span className={cn(textScale.micro, 'shrink-0 rounded-full bg-gc-muted px-2 py-0.5 font-semibold text-gc-text-muted')}>{tag}</span>
			) : null}
			{meta ? <span className={cn(textScale.micro, 'shrink-0 tabular-nums text-gc-text-muted')}>{meta}</span> : null}
			{selected ? <Check size={16} className="shrink-0" aria-hidden /> : null}
			{hasChildren && !selected ? <ChevronRight size={16} className="shrink-0 text-gc-text-muted" aria-hidden /> : null}
		</button>
	);
}

export default function ManualOrderChangesModal({ item, formatMoney, onSave, onClose }) {
	const [state, setState] = useState({ loading: true, error: null, groups: [], recipe: [] });
	const [selected, setSelected] = useState(() => new Map(
		(item.extras ?? []).filter((e) => e?.kind === 'change' && e.key).map((e) => [e.key, e]),
	));
	const [path, setPath] = useState({ groupId: null, actionKey: null, optionId: null });
	const closeRef = useRef(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			let groupsQuery = supabase.from(TABLES.menu_modifier_groups).select('*').order('sort_order', { ascending: true });
			if (item.company_id) groupsQuery = groupsQuery.eq('company_id', item.company_id);
			const [groupsRes, recipeRes] = await Promise.all([
				groupsQuery,
				supabase.from(TABLES.product_inventory_recipe).select('part, inventory_item_id, inventory_items(name)').eq('product_id', item.id),
			]);
			if (cancelled) return;
			if (groupsRes.error) {
				setState({ loading: false, error: 'No se pudieron cargar los cambios.', groups: [], recipe: [] });
				return;
			}
			const recipe = (recipeRes.data ?? [])
				.map((r) => ({ itemId: r.inventory_item_id, name: r.inventory_items?.name ?? '', part: r.part ?? null }))
				.filter((r) => r.name);
			setState({ loading: false, error: null, groups: groupsRes.data ?? [], recipe });
		})();
		return () => { cancelled = true; };
	}, [item.id, item.company_id]);

	useEffect(() => {
		closeRef.current?.focus();
		const onKey = (event) => { if (event.key === 'Escape') onClose(); };
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [onClose]);

	const tree = useMemo(() => buildTree(state.groups, item, state.recipe), [state.groups, item, state.recipe]);
	const node = tree.find((n) => n.group.id === path.groupId) ?? null;
	const action = node?.actions.find((a) => a.key === path.actionKey) ?? null;
	const changeFrom = action?.key === 'cambiar'
		? action.choices.find((c) => c.option.id === path.optionId) ?? null
		: null;
	const level = changeFrom ? 3 : action ? 2 : node ? 1 : 0;

	const goBack = () => {
		if (level === 3) setPath((p) => ({ ...p, optionId: null }));
		else if (level === 2) setPath((p) => ({ ...p, actionKey: null }));
		else setPath({ groupId: null, actionKey: null, optionId: null });
	};

	/*
	 * Sin exclusiones: en una promo pueden convivir «cambiar queso crema por salmón ×2» y
	 * «cambiar queso crema por panko ×1». Tocar un cambio ya elegido lo quita.
	 */
	const choose = (choice, actionKey) => {
		setSelected((prev) => {
			const next = new Map(prev);
			if (next.has(choice.key)) {
				next.delete(choice.key);
				return next;
			}
			next.set(choice.key, {
				kind: 'change',
				key: choice.key,
				groupId: node.group.id,
				optionId: choice.option.id,
				action: actionKey,
				name: choice.name,
				price: choice.price,
				quantity: 1,
			});
			return next;
		});
		setPath({ groupId: null, actionKey: null, optionId: null });
	};

	const removeChange = (key) => setSelected((prev) => {
		const next = new Map(prev);
		next.delete(key);
		return next;
	});

	/** Cantidad del cambio: en una promo, a cuántos rolls/unidades aplica. */
	const setChangeQuantity = (key, delta) => setSelected((prev) => {
		const current = prev.get(key);
		if (!current) return prev;
		const quantity = Math.min(MAX_CHANGE_QTY, Math.max(1, (Number(current.quantity) || 1) + delta));
		const next = new Map(prev);
		next.set(key, { ...current, quantity });
		return next;
	});

	const chosen = [...selected.values()];
	const surcharge = chosen.reduce((sum, e) => sum + (Number(e.price) || 0) * (Number(e.quantity) || 1), 0);
	const priceMeta = (price) => (price > 0 ? `+${formatMoney(price)}` : null);
	const countInGroup = (groupId) => chosen.filter((e) => e.groupId === groupId).length;

	let draft = null;
	if (node && !action) draft = `${node.group.name}: ¿qué quieres hacer?`;
	else if (action) {
		const optionName = changeFrom?.option.name;
		draft = `${action.label} ${lower(node.group.name)} de ${optionName ? lower(optionName) : '…'}`;
		if (action.key === 'cambiar') draft += ' por …';
	}

	const crumbs = [node?.group.name, action?.label, changeFrom?.option.name].filter(Boolean);
	const stepTitle = ['¿Qué parte?', '¿Qué hacer?', action?.key === 'cambiar' ? '¿Cuál cambiar?' : '¿Cuál?', '¿Por cuál?'][level];

	let rows = null;
	if (level === 0) {
		rows = tree.map(({ group }) => {
			const count = countInGroup(group.id);
			return (
				<StepRow
					key={group.id}
					label={group.name || 'Sin nombre'}
					meta={count > 0 ? `${count} ${count === 1 ? 'cambio' : 'cambios'}` : null}
					hasChildren
					onClick={() => setPath({ groupId: group.id, actionKey: null, optionId: null })}
				/>
			);
		});
	} else if (level === 1) {
		rows = node.actions.map((a) => (
			<StepRow
				key={a.key}
				label={a.label}
				meta={a.choices.length === 0
					? (a.key === 'agregar' ? 'Sin opciones' : `No lleva ${lower(node.group.name)}`)
					: null}
				disabled={a.choices.length === 0}
				hasChildren
				onClick={() => setPath((p) => ({ ...p, actionKey: a.key, optionId: null }))}
			/>
		));
	} else if (level === 2) {
		rows = action.choices.map((choice) => (action.key === 'cambiar' ? (
			<StepRow
				key={choice.option.id}
				label={choice.option.name}
				tag={choice.inRecipe ? 'Lleva' : null}
				meta={choice.targets.length === 0 ? 'Sin alternativas' : null}
				disabled={choice.targets.length === 0}
				selected={choice.targets.some((t) => selected.has(t.key))}
				hasChildren
				onClick={() => setPath((p) => ({ ...p, optionId: choice.option.id }))}
			/>
		) : (
			<StepRow
				key={choice.key}
				label={choice.option.name}
				tag={choice.inRecipe ? 'Lleva' : null}
				meta={priceMeta(choice.price)}
				selected={selected.has(choice.key)}
				onClick={() => choose(choice, action.key)}
			/>
		)));
	} else {
		rows = changeFrom.targets.map((choice) => (
			<StepRow
				key={choice.key}
				label={choice.target.name}
				tag={choice.inRecipe ? 'Lleva' : null}
				meta={priceMeta(choice.price)}
				selected={selected.has(choice.key)}
				onClick={() => choose(choice, 'cambiar')}
			/>
		));
	}

	const content = (
		<div
			// `.manual-order-portal-scope` lleva pointer-events: none; sin esto los toques caen al catálogo de atrás.
			className="pointer-events-auto fixed inset-0 z-[1200] flex touch-manipulation items-end justify-center bg-black/45 sm:items-center sm:p-4"
			onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="manual-order-changes-title"
				className="flex h-[min(680px,92vh)] w-full max-w-md flex-col overflow-hidden rounded-t-[22px] border border-gc-border bg-gc-page shadow-xl sm:rounded-[22px]"
			>
				<header className="flex items-center gap-2 border-b border-gc-border bg-gc-card px-3 py-3">
					{level > 0 ? (
						<Button variant="ghost" type="button" onClick={goBack} className="h-10 w-10 shrink-0 rounded-full p-0 text-gc-text" aria-label="Volver">
							<ChevronLeft size={20} />
						</Button>
					) : <span className="w-1" aria-hidden />}
					<div className="min-w-0 flex-1">
						<h2 id="manual-order-changes-title" className={cn(textScale.emphasis, 'truncate font-bold text-gc-text')}>
							Cambios · {item.name}
						</h2>
						<p className={cn(textScale.micro, 'truncate text-gc-text-muted')}>
							{crumbs.length > 0 ? crumbs.join(' › ') : (item.quantity > 1 ? `Aplica a las ${item.quantity} unidades` : 'Elige qué modificar')}
						</p>
					</div>
					<Button ref={closeRef} variant="ghost" type="button" onClick={onClose} className="h-10 w-10 shrink-0 rounded-full p-0 text-gc-text-muted" aria-label="Cerrar">
						<X size={18} />
					</Button>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
					{state.loading ? <p className={cn(textScale.body, 'text-gc-text-muted')}>Cargando…</p> : null}
					{state.error ? <p className={cn(textScale.body, 'text-gc-danger')}>{state.error}</p> : null}
					{!state.loading && !state.error && tree.length === 0 ? (
						<p className={cn(textScale.body, 'text-gc-text-muted')}>
							Este producto no tiene cambios configurados. Se arman en Menú → Agregar cambios.
						</p>
					) : null}
					{!state.loading && tree.length > 0 ? (
						<>
							<p className={cn(textScale.micro, 'mb-2 font-semibold uppercase tracking-wide text-gc-text-muted')}>{stepTitle}</p>
							<div key={level} className="manual-order-fade-in flex flex-col gap-2">{rows}</div>
						</>
					) : null}
				</div>

				<section
					aria-label="Resumen de cambios"
					aria-live="polite"
					className="mx-4 mb-3 max-h-[36%] min-h-[112px] overflow-y-auto rounded-[16px] border border-gc-border bg-gc-card px-4 py-3"
				>
					{draft ? <p className={cn(textScale.body, 'mb-2 italic text-gc-text-muted')}>{draft}</p> : null}
					{chosen.length === 0 && !draft ? (
						<p className={cn(textScale.body, 'text-gc-text-muted')}>Aquí vas a ver lo que quitas, agregas o cambias.</p>
					) : null}
					<ul className="flex flex-col gap-1.5">
						{chosen.map((extra) => {
							const qty = Number(extra.quantity) || 1;
							return (
							<li key={extra.key} className="flex items-center gap-2">
								<span className={cn(textScale.body, 'min-w-0 flex-1 font-semibold text-gc-text first-letter:uppercase')}>{extra.name}</span>
								{Number(extra.price) > 0 ? (
									<span className={cn(textScale.micro, 'shrink-0 tabular-nums text-gc-text-muted')}>+{formatMoney(Number(extra.price) * qty)}</span>
								) : null}
								<span className="flex shrink-0 items-center rounded-full border border-gc-border" role="group" aria-label={`Cantidad de «${extra.name}»`}>
									<button
										type="button"
										onClick={() => setChangeQuantity(extra.key, -1)}
										disabled={qty <= 1}
										className="flex h-7 w-7 items-center justify-center rounded-full text-gc-text-muted hover:bg-gc-muted disabled:opacity-40"
										aria-label="Menos"
									>
										<Minus size={12} />
									</button>
									<span className={cn(textScale.micro, 'min-w-[2.25rem] text-center font-bold tabular-nums text-gc-text')}>× {qty}</span>
									<button
										type="button"
										onClick={() => setChangeQuantity(extra.key, 1)}
										disabled={qty >= MAX_CHANGE_QTY}
										className="flex h-7 w-7 items-center justify-center rounded-full text-gc-text-muted hover:bg-gc-muted disabled:opacity-40"
										aria-label="Más"
									>
										<Plus size={12} />
									</button>
								</span>
								<button
									type="button"
									onClick={() => removeChange(extra.key)}
									className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gc-text-muted hover:bg-gc-muted hover:text-gc-danger"
									aria-label={`Quitar «${extra.name}»`}
								>
									<X size={14} />
								</button>
							</li>
							);
						})}
					</ul>
				</section>

				<footer className="flex gap-2 border-t border-gc-border bg-gc-card px-4 py-3">
					<Button variant="outline" type="button" className="min-h-[44px] flex-1 rounded-[12px]" onClick={onClose}>
						Cancelar
					</Button>
					<button
						type="button"
						className={cn(primaryActionButtonClass, 'flex-[1.4]')}
						onClick={() => { onSave(chosen); onClose(); }}
						disabled={state.loading}
					>
						{chosen.length === 0 ? 'Guardar' : `Guardar ${chosen.length}${surcharge > 0 ? ` · +${formatMoney(surcharge)}` : ''}`}
					</button>
				</footer>
			</div>
		</div>
	);

	return createPortal(content, document.querySelector('.manual-order-portal-scope') ?? document.body);
}
