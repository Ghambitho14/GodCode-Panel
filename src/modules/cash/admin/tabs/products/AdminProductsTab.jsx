import React from 'react';
import {
	Search, Filter, Eye, LayoutGrid, List, ArrowUpDown, Image, ImageOff,
} from 'lucide-react';
import AdminErrorBoundary from '../../../components/AdminErrorBoundary';
import InventoryCard from '../../../components/InventoryCard';
import '../../../styles/AdminProducts.css';
import { useAdmin } from '../../pages/AdminProvider';
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
	{ value: 'all', label: 'Todos los estados' },
	{ value: 'active', label: 'Solo Activos' },
	{ value: 'paused', label: 'Solo Pausados' },
];

const SORT_OPTIONS = [
	{ value: 'name-asc', label: 'Nombre (A-Z)' },
	{ value: 'price-asc', label: 'Precio (Menor a Mayor)' },
	{ value: 'price-desc', label: 'Precio (Mayor a Menor)' },
];

export default function AdminProductsTab() {
	const {
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
				<div className="admin-toolbar products-toolbar glass">
					<div className="products-toolbar__row">
						<div className="search-box">
							<Search size={18} aria-hidden />
							<input
								placeholder="Buscar producto..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								aria-label="Buscar producto"
							/>
						</div>

						<div className="products-toolbar__views">
							<div className="admin-toolbar-view-toggle" role="group" aria-label="Modo de vista">
								<Button
									type="button"
									variant="secondary"
									size="icon"
									className={`btn-icon-toggle ${viewMode === 'grid' ? 'active' : ''}`}
									onClick={() => setViewMode('grid')}
									title="Vista Grilla"
									aria-label="Vista grilla"
									aria-pressed={viewMode === 'grid'}
								>
									<LayoutGrid size={18} />
								</Button>
								<Button
									type="button"
									variant="secondary"
									size="icon"
									className={`btn-icon-toggle ${viewMode === 'list' ? 'active' : ''}`}
									onClick={() => setViewMode('list')}
									title="Vista Lista"
									aria-label="Vista lista"
									aria-pressed={viewMode === 'list'}
								>
									<List size={18} />
								</Button>
							</div>
							<Button
								type="button"
								variant="secondary"
								size="icon"
								className={`btn-icon-toggle products-toolbar__photos${showProductPhotos ? ' active' : ''}`}
								onClick={() => setShowProductPhotos((v) => !v)}
								aria-pressed={showProductPhotos}
								title={showProductPhotos ? 'Ocultar fotos en la lista de productos' : 'Mostrar fotos en la lista de productos'}
								aria-label={showProductPhotos ? 'Ocultar fotos en la lista de productos' : 'Mostrar fotos en la lista de productos'}
							>
								{showProductPhotos ? <Image size={18} aria-hidden /> : <ImageOff size={18} aria-hidden />}
							</Button>
						</div>
					</div>

					<div className="products-toolbar__filters">
						<div className="filter-box">
							<Filter size={18} aria-hidden />
							<Select value={filterCategory} onValueChange={setFilterCategory}>
								<SelectTrigger className="admin-toolbar-select-trigger" aria-label="Filtrar por categoría">
									<SelectValue placeholder="Todas las categorías" />
								</SelectTrigger>
								<SelectContent className="admin-toolbar-select-content" position="popper" align="center">
									<SelectItem value="all">Todas las categorías</SelectItem>
									{categories.map((c) => (
										<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="filter-box">
							<Eye size={18} aria-hidden />
							<Select value={filterStatus} onValueChange={setFilterStatus}>
								<SelectTrigger className="admin-toolbar-select-trigger" aria-label="Filtrar por estado">
									<SelectValue placeholder="Todos los estados" />
								</SelectTrigger>
								<SelectContent className="admin-toolbar-select-content" position="popper" align="center">
									{STATUS_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="filter-box filter-box--compact">
							<ArrowUpDown size={18} aria-hidden />
							<Select value={sortOrder} onValueChange={setSortOrder}>
								<SelectTrigger className="admin-toolbar-select-trigger" aria-label="Ordenar productos">
									<SelectValue placeholder="Ordenar" />
								</SelectTrigger>
								<SelectContent className="admin-toolbar-select-content" position="popper" align="center">
									{SORT_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				<p className="products-summary" aria-live="polite">
					<span><strong>{productStats.total}</strong> {productStats.total === 1 ? 'producto' : 'productos'}</span>
					<span className="products-summary__sep" aria-hidden>·</span>
					<span><strong>{productStats.active}</strong> {productStats.active === 1 ? 'activo' : 'activos'}</span>
					<span className="products-summary__sep" aria-hidden>·</span>
					<span className={productStats.paused > 0 ? 'products-summary__paused' : undefined}>
						<strong>{productStats.paused}</strong> {productStats.paused === 1 ? 'pausado' : 'pausados'}
					</span>
				</p>

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
