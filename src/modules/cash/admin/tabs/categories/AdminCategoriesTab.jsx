import React, { useMemo, useState, useCallback } from 'react';
import {
	List, Edit, ShoppingBag, Trash2, Plus,
} from 'lucide-react';
import { createMoneyFormatter } from '@/shared/utils/money';
import AdminErrorBoundary from '../../../components/AdminErrorBoundary';
import { useAdmin } from '../../pages/AdminProvider';
import { Button } from "@/components/ui/button";

export default function AdminCategoriesTab() {
	const {
		categories,
		products,
		orders,
		selectedBranch,
		isMobile,
		toggleCategoryActive,
		setEditingCategory,
		setIsCategoryModalOpen,
		deleteCategory,
		setFilterCategory,
		setActiveTab,
		reorderCategories,
		refreshCatalog,
		resolvedTabLabels,
	} = useAdmin();

	const tabLabels = resolvedTabLabels || {};
	const sortedCategories = useMemo(
		() => [...categories].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)),
		[categories],
	);
	const { formatMoney: formatBranchMoney } = useMemo(
		() => createMoneyFormatter(selectedBranch),
		[selectedBranch],
	);
	const [dragCategoryId, setDragCategoryId] = useState(null);
	const [dragOverCategoryId, setDragOverCategoryId] = useState(null);
	const dragEnabled = !isMobile;

	const handleDragStart = useCallback((categoryId) => {
		setDragCategoryId(categoryId);
	}, []);

	const handleDragOver = useCallback((event, categoryId) => {
		event.preventDefault();
		setDragOverCategoryId((prev) => (categoryId !== prev ? categoryId : prev));
	}, []);

	const handleDragLeave = useCallback((categoryId) => {
		setDragOverCategoryId((prev) => (prev === categoryId ? null : prev));
	}, []);

	const handleDrop = useCallback(async (event, categoryId) => {
		event.preventDefault();
		if (!dragCategoryId || dragCategoryId === categoryId) {
			setDragCategoryId(null);
			setDragOverCategoryId(null);
			return;
		}
		const ids = sortedCategories.map((cat) => cat.id);
		const fromIndex = ids.indexOf(dragCategoryId);
		const toIndex = ids.indexOf(categoryId);
		if (fromIndex === -1 || toIndex === -1) {
			setDragCategoryId(null);
			setDragOverCategoryId(null);
			return;
		}
		const next = [...ids];
		const [moved] = next.splice(fromIndex, 1);
		next.splice(toIndex, 0, moved);
		await reorderCategories(next);
		setDragCategoryId(null);
		setDragOverCategoryId(null);
	}, [dragCategoryId, sortedCategories, reorderCategories]);

	return (
		<AdminErrorBoundary tabLabel={tabLabels.categories || 'Categorías'} onRetry={() => refreshCatalog()}>
			<div className="cat-container">
				{(!selectedBranch || selectedBranch.id === 'all') ? (
					<div className="cat-empty-state">
						<div className="cat-empty-icon">
							<List size={48} />
						</div>
						<h3 className="cat-empty-title">Selecciona una sucursal</h3>
						<p className="cat-empty-text">El orden y activación de categorías es por local.</p>
					</div>
				) : (
					<div className="cat-grid">
						{sortedCategories.map((c) => {
							const categoryProducts = products.filter((p) => p.category_id === c.id);
							const activeProducts = categoryProducts.filter((p) => p.is_active);
							const totalRevenue = orders
								.filter((o) => o.status === 'completed' || o.status === 'picked_up')
								.reduce((sum, order) => {
									const items = Array.isArray(order.items) ? order.items : [];
									return sum + items.reduce((itemSum, item) => {
										const product = products.find((p) => p.id === (item.id ?? item.product_id));
										if (!product || product.category_id !== c.id) return itemSum;
										const qty = Math.max(0, Number(item.quantity) || 1);
										const price = Number(item.price) || 0;
										return itemSum + price * qty;
									}, 0);
								}, 0);

							const catalogShare = products.length > 0
								? Math.round((categoryProducts.length / products.length) * 100)
								: 0;

							return (
								<div
									key={c.id}
									className={`cat-card${dragCategoryId === c.id ? ' is-dragging' : ''}${dragOverCategoryId === c.id ? ' is-drop-target' : ''}${c.is_active ? '' : ' is-inactive'}`}
									draggable={dragEnabled}
									onDragStart={dragEnabled ? () => handleDragStart(c.id) : undefined}
									onDragEnd={dragEnabled ? () => { setDragCategoryId(null); setDragOverCategoryId(null); } : undefined}
									onDragOver={dragEnabled ? (event) => handleDragOver(event, c.id) : undefined}
									onDragLeave={dragEnabled ? () => handleDragLeave(c.id) : undefined}
									onDrop={dragEnabled ? (event) => handleDrop(event, c.id) : undefined}
								>
									<div className="cat-card-body">
										{/* Nombre y estado en la misma fila: la pastilla ocupaba ella
										    sola un renglón entero arriba de la tarjeta. */}
										<div className="cat-name-row">
											<h3 className="cat-name">{c.name}</h3>
											<Button
												type="button"
												variant="secondary"
												size="sm"
												className={`cat-status-badge cat-status-button${c.is_active ? ' is-active' : ' is-inactive'}`}
												onClick={(event) => {
													event.stopPropagation();
													toggleCategoryActive(c.id, !c.is_active);
												}}
												title={c.is_active ? 'Desactivar categoría' : 'Activar categoría'}
											>
												<span className={`cat-status-dot ${c.is_active ? 'active' : 'inactive'}`} />
												<span className="cat-status-text">{c.is_active ? 'Activa' : 'Inactiva'}</span>
											</Button>
										</div>

										{/* Una línea en vez de dos bloques con rótulo: el número de
										    pausados solo aparece cuando hay alguno, que es la única
										    vez que "activos" dice algo distinto del total. */}
										<p className="cat-meta">
											<span className="cat-order-badge" title="Orden en el menú">
												#{Number(c.order) || 0}
											</span>
											<span>
												<strong>{categoryProducts.length}</strong>{' '}
												{categoryProducts.length === 1 ? 'producto' : 'productos'}
											</span>
											{categoryProducts.length !== activeProducts.length ? (
												<span className="cat-meta__paused">
													{categoryProducts.length - activeProducts.length} en pausa
												</span>
											) : null}
										</p>

										<p className="cat-revenue">
											<strong className="cat-revenue-value">{formatBranchMoney(totalRevenue)}</strong>
										</p>

										<div className="cat-progress-wrapper">
											<div className="cat-progress-bar" aria-hidden>
												<div
													className="cat-progress-fill"
													style={{ width: `${catalogShare}%` }}
												/>
											</div>
											<span className="cat-progress-text">{catalogShare}% del catálogo</span>
										</div>
									</div>

									<div className="cat-card-footer">
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="cat-btn cat-btn-edit"
											onClick={() => { setEditingCategory(c); setIsCategoryModalOpen(true); }}
										>
											<Edit size={14} aria-hidden />
											Editar
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="cat-btn cat-btn-view"
											onClick={() => {
												setFilterCategory(String(c.id));
												setActiveTab('products');
											}}
										>
											<ShoppingBag size={14} aria-hidden />
											Productos
										</Button>
										{/* Solo el icono y apartado a la derecha: borrar no debe pesar
										    lo mismo que editar o ver productos. */}
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="cat-btn cat-btn-delete"
											onClick={() => deleteCategory(c)}
											title="Eliminar categoría"
											aria-label={`Eliminar la categoría ${c.name}`}
										>
											<Trash2 size={15} aria-hidden />
										</Button>
									</div>
								</div>
							);
						})}
						{categories.length === 0 && (
							<div className="cat-empty-state">
								<div className="cat-empty-icon">
									<List size={48} />
								</div>
								<h3 className="cat-empty-title">No hay categorías</h3>
								<p className="cat-empty-text">Crea tu primera categoría para organizar tus productos</p>
								<Button variant="default" type="button" onClick={() => { setEditingCategory(null); setIsCategoryModalOpen(true); }} className="">
									<Plus size={18} /> Crear Categoría
								</Button>
							</div>
						)}
					</div>
				)}
			</div>
		</AdminErrorBoundary>
	);
}
