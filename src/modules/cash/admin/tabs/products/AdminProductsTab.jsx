import React from 'react';
import {
	Search, Filter, Package, Eye, EyeOff, LayoutGrid, List, ArrowUpDown, Image, ImageOff,
} from 'lucide-react';
import AdminErrorBoundary from '../../../components/AdminErrorBoundary';
import InventoryCard from '../../../components/InventoryCard';
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
				<div className="admin-stats-bar glass">
					<div className="admin-stats-bar__metrics">
						<div className="admin-stats-bar__item">
							<div className="admin-stats-bar__icon" aria-hidden>
								<Package size={16} />
							</div>
							<div className="admin-stats-bar__copy">
								<span className="admin-stats-bar__label">Total</span>
								<strong className="admin-stats-bar__value">{productStats.total}</strong>
							</div>
						</div>
						<div className="admin-stats-bar__divider" aria-hidden />
						<div className="admin-stats-bar__item">
							<div className="admin-stats-bar__icon admin-stats-bar__icon--success" aria-hidden>
								<Eye size={16} />
							</div>
							<div className="admin-stats-bar__copy">
								<span className="admin-stats-bar__label">Activos</span>
								<strong className="admin-stats-bar__value admin-stats-bar__value--success">{productStats.active}</strong>
							</div>
						</div>
						<div className="admin-stats-bar__divider" aria-hidden />
						<div className="admin-stats-bar__item">
							<div className="admin-stats-bar__icon admin-stats-bar__icon--danger" aria-hidden>
								<EyeOff size={16} />
							</div>
							<div className="admin-stats-bar__copy">
								<span className="admin-stats-bar__label">Pausados</span>
								<strong className="admin-stats-bar__value admin-stats-bar__value--danger">{productStats.paused}</strong>
							</div>
						</div>
					</div>
					<Button
						type="button"
						variant="secondary"
						className={`admin-stats-bar__photos-toggle${showProductPhotos ? ' is-on' : ''}`}
						onClick={() => setShowProductPhotos((v) => !v)}
						aria-pressed={showProductPhotos}
						title={showProductPhotos ? 'Ocultar fotos en la lista de productos' : 'Mostrar fotos en la lista de productos'}
					>
						{showProductPhotos ? <Image size={16} aria-hidden /> : <ImageOff size={16} aria-hidden />}
						<span>{showProductPhotos ? 'Fotos visibles' : 'Fotos ocultas'}</span>
					</Button>
				</div>

				<div className="admin-toolbar glass">
					<div className="admin-toolbar-row">
						<div className="search-box">
							<Search size={18} aria-hidden />
							<input
								placeholder="Buscar producto..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								aria-label="Buscar producto"
							/>
						</div>

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
					</div>

					<div className="admin-toolbar-actions">
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
