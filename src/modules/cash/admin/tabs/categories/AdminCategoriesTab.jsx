import React, { useMemo, useState, useCallback } from 'react';
import {
	List, Tag, Edit, ShoppingBag, Trash2, Plus,
} from 'lucide-react';
import { createMoneyFormatter } from '@/shared/utils/money';
import AdminErrorBoundary from '../../../components/AdminErrorBoundary';
import { useAdmin } from '../../pages/AdminProvider';

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
										const price = Number(item.price) ?? 0;
										return itemSum + price * qty;
									}, 0);
								}, 0);

							return (
								<div
									key={c.id}
									className={`cat-card glass${dragCategoryId === c.id ? ' is-dragging' : ''}${dragOverCategoryId === c.id ? ' is-drop-target' : ''}`}
									draggable={dragEnabled}
									onDragStart={dragEnabled ? () => handleDragStart(c.id) : undefined}
									onDragEnd={dragEnabled ? () => { setDragCategoryId(null); setDragOverCategoryId(null); } : undefined}
									onDragOver={dragEnabled ? (event) => handleDragOver(event, c.id) : undefined}
									onDragLeave={dragEnabled ? () => handleDragLeave(c.id) : undefined}
									onDrop={dragEnabled ? (event) => handleDrop(event, c.id) : undefined}
								>
									<div className="cat-card-header">
										<div className="cat-icon-wrapper">
											<Tag size={24} />
										</div>
										<button
											type="button"
											className="cat-status-badge cat-status-button"
											onClick={(event) => {
												event.stopPropagation();
												toggleCategoryActive(c.id, !c.is_active);
											}}
											title={c.is_active ? 'Desactivar categoría' : 'Activar categoría'}
										>
											<span className={`cat-status-dot ${c.is_active ? 'active' : 'inactive'}`} />
											<span className="cat-status-text">{c.is_active ? 'Activa' : 'Inactiva'}</span>
										</button>
									</div>
									<div className="cat-card-body">
										<div className="cat-name-row">
											<h3 className="cat-name">{c.name}</h3>
											<span className="cat-order-badge">#{Number(c.order) || 0}</span>
										</div>
										<div className="cat-stats">
											<div className="cat-stat">
												<span className="cat-stat-label">Productos</span>
												<span className="cat-stat-value">{categoryProducts.length}</span>
											</div>
											<div className="cat-stat">
												<span className="cat-stat-label">Activos</span>
												<span className="cat-stat-value">{activeProducts.length}</span>
											</div>
										</div>
										<div className="cat-revenue">
											<span className="cat-revenue-label">Ingresos totales</span>
											<span className="cat-revenue-value">{formatBranchMoney(totalRevenue)}</span>
										</div>
										<div className="cat-progress-wrapper">
											<div className="cat-progress-bar">
												<div
													className="cat-progress-fill"
													style={{ width: `${products.length > 0 ? (categoryProducts.length / products.length) * 100 : 0}%` }}
												/>
											</div>
											<span className="cat-progress-text">
												{products.length > 0 ? Math.round((categoryProducts.length / products.length) * 100) : 0}% del catálogo
											</span>
										</div>
									</div>
									<div className="cat-card-footer">
										<button type="button" onClick={() => { setEditingCategory(c); setIsCategoryModalOpen(true); }} className="cat-btn-edit">
											<Edit size={16} />
											Editar
										</button>
										<button
											type="button"
											onClick={() => {
												setFilterCategory(c.id);
												setActiveTab('products');
											}}
											className="cat-btn-view"
										>
											<ShoppingBag size={16} />
											Ver productos
										</button>
										<button type="button" onClick={() => deleteCategory(c)} className="cat-btn-delete" title="Eliminar categoría">
											<Trash2 size={16} />
											Borrar
										</button>
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
								<button type="button" onClick={() => { setEditingCategory(null); setIsCategoryModalOpen(true); }} className="btn btn-primary">
									<Plus size={18} /> Crear Categoría
								</button>
							</div>
						)}
					</div>
				)}
			</div>
		</AdminErrorBoundary>
	);
}
