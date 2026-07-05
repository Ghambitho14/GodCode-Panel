import React from 'react';
import {
	Search, Filter, Package, Eye, EyeOff, LayoutGrid, List, ArrowUpDown, Image, ImageOff,
} from 'lucide-react';
import AdminErrorBoundary from '../../../components/AdminErrorBoundary';
import InventoryCard from '../../../components/InventoryCard';
import { useAdmin } from '../../pages/AdminProvider';
import { Button } from "@/components/ui/button";

export default function AdminProductsTab() {
	const {
		products,
		categories,
		processedProducts,
		productStats,
		searchQuery,
		setSearchQuery,
		filterCategory,
		setFilterCategory,
		filterStatus,
		setFilterStatus,
		viewMode,
		setViewMode,
		showProductPhotos,
		setShowProductPhotos,
		sortOrder,
		setSortOrder,
		toggleProductActive,
		setEditingProduct,
		setIsModalOpen,
		deleteProduct,
		refreshCatalog,
		resolvedTabLabels,
	} = useAdmin();

	const tabLabels = resolvedTabLabels || {};

	return (
		<AdminErrorBoundary
			tabLabel={tabLabels.products || 'Productos'}
			onRetry={() => refreshCatalog()}
		>
			<div className="products-view animate-fade">
				<div className="admin-stats-bar glass">
					<div className="admin-stats-bar__item">
						<div className="admin-stats-bar__icon"><Package size={18} /></div>
						<div>
							<span className="admin-stats-bar__label">Total Productos</span>
							<strong className="admin-stats-bar__value">{productStats.total}</strong>
						</div>
					</div>
					<div className="admin-stats-bar__divider" aria-hidden />
					<div className="admin-stats-bar__item">
						<div className="admin-stats-bar__icon admin-stats-bar__icon--success"><Eye size={18} /></div>
						<div>
							<span className="admin-stats-bar__label">Activos</span>
							<strong className="admin-stats-bar__value admin-stats-bar__value--success">{productStats.active}</strong>
						</div>
					</div>
					<div className="admin-stats-bar__divider" aria-hidden />
					<div className="admin-stats-bar__item">
						<div className="admin-stats-bar__icon admin-stats-bar__icon--danger"><EyeOff size={18} /></div>
						<div>
							<span className="admin-stats-bar__label">Pausados</span>
							<strong className="admin-stats-bar__value admin-stats-bar__value--danger">{productStats.paused}</strong>
						</div>
					</div>
					<Button variant="default"
						type="button"
						className={`admin-stats-bar__photos-toggle${showProductPhotos ? ' is-on' : ''}`}
						onClick={() => setShowProductPhotos((v) => !v)}
						aria-pressed={showProductPhotos}
						title={showProductPhotos ? 'Ocultar fotos en la lista de productos' : 'Mostrar fotos en la lista de productos'}
					>
						{showProductPhotos ? <Image size={18} aria-hidden /> : <ImageOff size={18} aria-hidden />}
						<span>{showProductPhotos ? 'Fotos visibles' : 'Fotos ocultas'}</span>
					</Button>
				</div>

				<div className="admin-toolbar glass">
					<div className="admin-toolbar-row">
						<div className="search-box">
							<Search size={18} />
							<input placeholder="Buscar producto..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
						</div>
						<div className="filter-box">
							<Filter size={18} />
							<select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
								<option value="all">Todas las categorías</option>
								{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
							</select>
						</div>
						<div className="filter-box">
							<Eye size={18} />
							<select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
								<option value="all">Todos los estados</option>
								<option value="active">Solo Activos</option>
								<option value="paused">Solo Pausados</option>
							</select>
						</div>
					</div>
					<div className="admin-toolbar-actions">
						<div className="filter-box filter-box--compact">
							<ArrowUpDown size={18} />
							<select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
								<option value="name-asc">Nombre (A-Z)</option>
								<option value="price-asc">Precio (Menor a Mayor)</option>
								<option value="price-desc">Precio (Mayor a Menor)</option>
							</select>
						</div>
						<Button variant="default" type="button" className={`btn-icon-toggle ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Vista Grilla">
							<LayoutGrid size={18} />
						</Button>
						<Button variant="default" type="button" className={`btn-icon-toggle ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="Vista Lista">
							<List size={18} />
						</Button>
					</div>
				</div>

				<div className={`inventory-grid${viewMode === 'list' ? ' list-mode' : ''}${showProductPhotos ? '' : ' inventory-grid--no-photos'}`}>
					{processedProducts.map((p) => (
						<InventoryCard
							key={p.id}
							product={p}
							viewMode={viewMode}
							showPhotos={showProductPhotos}
							toggleProductActive={toggleProductActive}
							setEditingProduct={setEditingProduct}
							setIsModalOpen={setIsModalOpen}
							deleteProduct={deleteProduct}
						/>
					))}
				</div>
			</div>
		</AdminErrorBoundary>
	);
}
