import React, { useState, useMemo, useRef, useDeferredValue, useEffect, useId } from 'react';
import { Search, PackageX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import ProductCard from './ProductCard';
import { Button } from "@/components/ui/button";
import { catalogGridGapClass, spacing, textScale, pillRadiusClass } from './manualOrderStyles';

/**
 * Agrupa los productos en base a su categoría y los ordena según corresponda.
 */
function groupProductsByCategory(items, categories = []) {
    const sortedCategories = [...(categories || [])]
        .filter((cat) => cat?.is_active !== false)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    const normalizeId = (value) => (value == null ? '' : String(value).trim());
    const normalizeName = (value) => (typeof value === 'string' ? value.trim() : '');

    const categoryById = new Map(sortedCategories.map((cat) => [normalizeId(cat?.id), cat]));
    const buckets = new Map();
    const uncategorized = [];

    (items || []).forEach((item) => {
        const id =
            normalizeId(item?.category_id) ||
            normalizeId(item?.categoryId) ||
            normalizeId(item?.category?.id);
        const name =
            normalizeName(item?.category_name) ||
            normalizeName(item?.categoryName) ||
            normalizeName(item?.category?.name);

        const knownCategory = id ? categoryById.get(id) : null;
        if (knownCategory) {
            const key = `id:${normalizeId(knownCategory.id)}`;
            if (!buckets.has(key)) {
                buckets.set(key, {
                    id: knownCategory.id,
                    name: knownCategory.name || 'Sin categoría',
                    order: Number(knownCategory.order) || 0,
                    products: [],
                });
            }
            buckets.get(key).products.push(item);
            return;
        }

        if (name) {
            const key = `name:${name.toLowerCase()}`;
            if (!buckets.has(key)) {
                buckets.set(key, {
                    id: key,
                    name,
                    order: 9999,
                    products: [],
                });
            }
            buckets.get(key).products.push(item);
            return;
        }

        uncategorized.push(item);
    });

    const groupedCategories = [...buckets.values()].sort((a, b) => (
        a.order === b.order
            ? String(a.name).localeCompare(String(b.name), 'es')
            : a.order - b.order
    ));

    return { groupedCategories, uncategorized };
}

function normalizeCategoryId(id) {
    return id == null ? '' : String(id).trim();
}

function buildCategoryNavKey(variant, id) {
    return `${variant}:${normalizeCategoryId(id)}`;
}

/** Desplaza solo dentro de `.manual-order-categories-scroll` (no propaga al overlay). */
function scrollWithinCatalog(el, offsetTop = 12) {
    if (!el) return;
    const scrollParent = el.closest('.manual-order-categories-scroll');
    if (!scrollParent) return;

    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    let targetTop = scrollParent.scrollTop + (elRect.top - parentRect.top) - offsetTop;

    if (!Number.isFinite(targetTop)) {
        let top = 0;
        let node = el;
        while (node && node !== scrollParent) {
            top += node.offsetTop;
            node = node.offsetParent;
        }
        targetTop = top - offsetTop;
    }

    scrollParent.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
}

const ManualOrderCatalog = ({
    products = [],
    categories = [],
    cartUpsellCatalogs = { beveragesEnabled: false, extrasEnabled: false, beverages: [], extras: [] },
    addItem,
    updateQuantity,
    removeItem,
    getQty,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchPhase, setSearchPhase] = useState(/** @type {'closed' | 'open' | 'closing'} */ ('closed'));
    const [activeCategory, setActiveCategory] = useState(null);
    const searchInputId = useId();
    const searchInputRef = useRef(null);

    const catalogScrollRef = useRef(null);
    const categoriesNavRef = useRef(null);
    const categoryChipRefsRef = useRef(new Map());
    const productsSectionRef = useRef(null);
    const beveragesSectionRef = useRef(null);
    const extrasSectionRef = useRef(null);
    const categoryRefsRef = useRef(new Map());

    const setCategoryRef = (key) => (el) => {
        if (el) categoryRefsRef.current.set(key, el);
        else categoryRefsRef.current.delete(key);
    };

    const setCategoryChipRef = (key) => (el) => {
        if (el) categoryChipRefsRef.current.set(key, el);
        else categoryChipRefsRef.current.delete(key);
    };

    const deferredSearchQuery = useDeferredValue(searchQuery);
    const query = deferredSearchQuery.trim().toLowerCase();

    const isProductAvailableForManualOrder = (product) => {
        if (!product) return false;
        if (product.is_active !== true) return false;
        const basePrice = Number(product?.price || 0);
        const hasDiscount = Boolean(product?.has_discount) && product?.discount_price != null && Number(product.discount_price) > 0;
        const effectivePrice = hasDiscount ? Number(product.discount_price) : basePrice;
        return effectivePrice > 0;
    };

    const baseProducts = useMemo(() => {
        return (products || []).filter((product) => {
            if (!isProductAvailableForManualOrder(product)) return false;
            const productName = String(product?.name || '').toLowerCase();
            const categoryName = String(product?.category_name || product?.categoryName || product?.category?.name || '').toLowerCase();
            return productName.includes(query) || categoryName.includes(query);
        });
    }, [products, query]);

    const beverageProducts = useMemo(() => {
        if (!cartUpsellCatalogs.beveragesEnabled) return [];
        return (cartUpsellCatalogs.beverages || []).filter((item) => {
            const name = String(item?.name || '').toLowerCase();
            const categoryName = String(item?.category_name || '').toLowerCase();
            const detail = String(item?.description || '').toLowerCase();
            return name.includes(query) || categoryName.includes(query) || detail.includes(query);
        });
    }, [cartUpsellCatalogs.beverages, cartUpsellCatalogs.beveragesEnabled, query]);

    const extraProducts = useMemo(() => {
        if (!cartUpsellCatalogs.extrasEnabled) return [];
        return (cartUpsellCatalogs.extras || []).filter((item) => {
            const name = String(item?.name || '').toLowerCase();
            const categoryName = String(item?.category_name || '').toLowerCase();
            const detail = String(item?.description || '').toLowerCase();
            return name.includes(query) || categoryName.includes(query) || detail.includes(query);
        });
    }, [cartUpsellCatalogs.extras, cartUpsellCatalogs.extrasEnabled, query]);

    const groupedBaseCatalog = useMemo(
        () => (baseProducts.length > 0 ? groupProductsByCategory(baseProducts, categories) : { groupedCategories: [], uncategorized: [] }),
        [baseProducts, categories],
    );

    const groupedBeverageCatalog = useMemo(
        () => (beverageProducts.length > 0 ? groupProductsByCategory(beverageProducts, []) : { groupedCategories: [], uncategorized: [] }),
        [beverageProducts],
    );

    const groupedExtrasCatalog = useMemo(
        () => (extraProducts.length > 0 ? groupProductsByCategory(extraProducts, []) : { groupedCategories: [], uncategorized: [] }),
        [extraProducts],
    );

    const hasAnyResults = baseProducts.length > 0 || beverageProducts.length > 0 || extraProducts.length > 0;
    const hasProductsSection = baseProducts.length > 0;
    const hasBeveragesSection = cartUpsellCatalogs.beveragesEnabled && beverageProducts.length > 0;
    const hasExtrasSection = cartUpsellCatalogs.extrasEnabled && extraProducts.length > 0;

    const sidebarCategories = useMemo(() => {
        const items = [];
        const pushFromCatalog = (catalog, variant) => {
            catalog.groupedCategories.forEach((cat) => {
                items.push({
                    key: buildCategoryNavKey(variant, cat.id),
                    name: cat.name,
                    count: cat.products.length,
                    variant,
                });
            });
            if (catalog.uncategorized.length > 0) {
                items.push({
                    key: buildCategoryNavKey(variant, '__uncat__'),
                    name: variant === 'products' ? 'Otros' : variant === 'beverages' ? 'Bebidas' : 'Extras',
                    count: catalog.uncategorized.length,
                    variant,
                });
            }
        };
        if (hasProductsSection) pushFromCatalog(groupedBaseCatalog, 'products');
        if (hasBeveragesSection) pushFromCatalog(groupedBeverageCatalog, 'beverages');
        if (hasExtrasSection) pushFromCatalog(groupedExtrasCatalog, 'extras');
        return items;
    }, [
        groupedBaseCatalog,
        groupedBeverageCatalog,
        groupedExtrasCatalog,
        hasProductsSection,
        hasBeveragesSection,
        hasExtrasSection,
    ]);

    const totalItems = baseProducts.length + beverageProducts.length + extraProducts.length;

    const scrollToCategory = (key) => {
        setActiveCategory(key);
        let el = categoryRefsRef.current.get(key);
        const scrollParent = catalogScrollRef.current;
        if (!el && scrollParent) {
            const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
            el = scrollParent.querySelector(`[data-category-key="${escaped}"]`);
        }
        scrollWithinCatalog(el, 80);
    };

    const scrollToSection = (sectionRef) => {
        scrollWithinCatalog(sectionRef?.current, 12);
    };

    // Highlight first category by default when catalog loads
    useEffect(() => {
        if (activeCategory == null && sidebarCategories.length > 0) {
            setActiveCategory(sidebarCategories[0].key);
        }
    }, [sidebarCategories, activeCategory]);

    // Mantener el chip activo visible en la nav horizontal al hacer scroll del catálogo.
    useEffect(() => {
        if (!activeCategory || searchPhase !== 'closed') return;
        const chip = categoryChipRefsRef.current.get(activeCategory);
        const nav = categoriesNavRef.current;
        if (!chip || !nav) return;

        const navRect = nav.getBoundingClientRect();
        const chipRect = chip.getBoundingClientRect();
        const edgePad = 16;
        const fullyVisible =
            chipRect.left >= navRect.left + edgePad &&
            chipRect.right <= navRect.right - edgePad;
        if (fullyVisible) return;

        chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [activeCategory, searchPhase]);

	useEffect(() => {
		const root = catalogScrollRef.current;
		if (!root || typeof IntersectionObserver === 'undefined') return undefined;
		const observer = new IntersectionObserver((entries) => {
			const visible = entries
				.filter((entry) => entry.isIntersecting)
				.sort((a, b) => b.intersectionRatio - a.intersectionRatio || a.boundingClientRect.top - b.boundingClientRect.top);
			const key = visible[0]?.target?.dataset?.categoryKey;
			if (key) setActiveCategory(key);
		}, { root, rootMargin: '-72px 0px -55% 0px', threshold: [0.05, 0.25, 0.6] });
		for (const element of categoryRefsRef.current.values()) observer.observe(element);
		return () => observer.disconnect();
	}, [sidebarCategories, query]);

    const renderCatalogSection = (catalog, variant = 'products') => {
        if (!catalog || (catalog.groupedCategories.length === 0 && catalog.uncategorized.length === 0)) return null;

        return (
            <section className="mb-6 sm:mb-8 lg:mb-10 last:mb-0">
                {catalog.groupedCategories.map((cat) => {
                    const navKey = buildCategoryNavKey(variant, cat.id);
                    return (
                        <div
                            key={`${variant}-${normalizeCategoryId(cat.id)}`}
                            className="mb-4 sm:mb-6"
                            data-category-key={navKey}
                            ref={setCategoryRef(navKey)}
                        >
                            <h3 className={`mb-2.5 flex items-center gap-2 ${textScale.emphasis} font-bold text-gc-text sm:mb-3`}>
                                <span className="h-4 w-0.5 rounded-full bg-gc-accent" aria-hidden />
                                {cat.name}
                                <span className={`rounded-full bg-gc-muted px-1.5 py-0.5 ${textScale.micro} font-semibold text-gc-text-muted`}>
                                    {cat.products.length}
                                </span>
                            </h3>
                            <div className={`grid grid-cols-1 ${catalogGridGapClass} min-[340px]:grid-cols-2 min-[880px]:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]`}>
                                {cat.products.map((p) => (
                                    <ProductCard
                                        key={p.id}
                                        product={p}
                                        quantity={getQty(p.id)}
                                        addItem={addItem}
                                        updateQuantity={updateQuantity}
                                        removeItem={removeItem}
                                        showProductImages
                                        sourceLabel={variant === 'beverages' ? 'Bebida' : variant === 'extras' ? 'Extra' : ''}
                                        variant={variant}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}

                {catalog.uncategorized.length > 0 && (
                    <div
                        className="mb-4 sm:mb-6"
                        data-category-key={buildCategoryNavKey(variant, '__uncat__')}
                        ref={setCategoryRef(buildCategoryNavKey(variant, '__uncat__'))}
                    >
                        <h3 className={`mb-2.5 flex items-center gap-2 ${textScale.emphasis} font-bold text-gc-text sm:mb-3`}>
                            <span className="h-4 w-0.5 rounded-full bg-gc-text-muted" aria-hidden />
                            Otros
                            <span className={`rounded-full bg-gc-muted px-1.5 py-0.5 ${textScale.micro} font-semibold text-gc-text-muted`}>
                                {catalog.uncategorized.length}
                            </span>
                        </h3>
                        <div className={`grid grid-cols-1 ${catalogGridGapClass} min-[340px]:grid-cols-2 min-[880px]:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]`}>
                            {catalog.uncategorized.map((p) => (
                                <ProductCard
                                    key={p.id}
                                    product={p}
                                    quantity={getQty(p.id)}
                                    addItem={addItem}
                                    updateQuantity={updateQuantity}
                                    removeItem={removeItem}
                                    showProductImages
                                    sourceLabel={variant === 'beverages' ? 'Bebida' : variant === 'extras' ? 'Extra' : ''}
                                    variant={variant}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </section>
        );
    };

    useEffect(() => {
        if (searchPhase !== 'open') return undefined;
        const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return () => window.clearTimeout(id);
    }, [searchPhase]);

    useEffect(() => {
        if (searchPhase !== 'closing') return undefined;
        const id = window.setTimeout(() => setSearchPhase('closed'), 320);
        return () => window.clearTimeout(id);
    }, [searchPhase]);

    const hasActiveSearch = Boolean(searchQuery.trim());
    const mobileSearchInputId = `${searchInputId}-mobile`;
    const searchVisible = searchPhase === 'open' || searchPhase === 'closing';

    const openMobileSearch = () => setSearchPhase('open');

    const closeMobileSearch = () => {
        setSearchQuery('');
        setSearchPhase((prev) => (prev === 'closed' ? prev : 'closing'));
    };

    const handleSearchAnimationEnd = (event) => {
        if (event.target !== event.currentTarget) return;
        if (searchPhase === 'closing') setSearchPhase('closed');
    };

    return (
        <div className="flex h-full flex-col">
            {/* Escritorio: título + búsqueda fija. Móvil: header oculto. */}
            <div className="manual-order-catalog-header mb-3 rounded-[18px] border border-gc-border bg-gc-card p-3.5 shadow-sm sm:mb-4 sm:p-4">
                <div className="manual-order-catalog-header__title mb-3 min-w-0">
                    <h2 className={`${textScale.emphasis} font-bold leading-tight text-gc-text`}>Productos disponibles</h2>
                    <p className={`mt-1 ${textScale.micro} font-medium text-gc-text-muted`} aria-hidden="true">
                        {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
                        {query ? ' encontrados' : ' en el catálogo'}
                    </p>
                </div>
                <p className="sr-only" aria-live="polite">
                    {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
                    {query ? ' encontrados' : ' en el catálogo'}
                </p>

                <div className="manual-order-catalog-header__search flex items-center" role="search">
                    <div className={`manual-order-catalog-header__field relative flex h-11 min-w-0 flex-1 items-center ${pillRadiusClass} border border-transparent bg-gc-muted transition-all focus-within:border-gc-accent/30 focus-within:bg-gc-card focus-within:ring-2 focus-within:ring-gc-accent/10`}>
                        <label htmlFor={searchInputId} className="sr-only">Buscar productos</label>
                        <Search size={17} className="pointer-events-none absolute left-3.5 text-gc-text-muted" aria-hidden="true" />
                        <input
                            id={searchInputId}
                            type="search"
                            placeholder="Buscar producto..."
                            className={`h-full w-full min-w-0 bg-transparent pl-10 pr-10 ${textScale.body} text-gc-text outline-none placeholder:text-gc-text-muted [&::-webkit-search-cancel-button]:hidden`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {hasActiveSearch ? (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-1.5 flex h-8 w-8 items-center justify-center rounded-full text-gc-text-muted transition-colors hover:bg-gc-border/60 hover:text-gc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent/30"
                                aria-label="Limpiar búsqueda"
                            >
                                <X size={15} aria-hidden="true" />
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className={`manual-order-catalog-body flex min-h-0 flex-1 flex-col ${spacing.normal}`}>
                <div
                    className={cn(
                        'manual-order-catalog-toolbar flex min-w-0 items-center gap-2',
                        searchVisible && 'manual-order-catalog-toolbar--search-open',
                    )}
                >
                    {searchVisible ? (
                        <div
                            className={cn(
                                `manual-order-catalog-toolbar__search relative flex h-10 min-w-0 flex-1 items-center ${pillRadiusClass} border border-gc-accent/25 bg-gc-card shadow-sm`,
                                searchPhase === 'closing' && 'manual-order-catalog-toolbar__search--closing',
                            )}
                            role="search"
                            onAnimationEnd={handleSearchAnimationEnd}
                        >
                            <label htmlFor={mobileSearchInputId} className="sr-only">Buscar productos</label>
                            <Search size={16} className="pointer-events-none absolute left-3 text-gc-accent" aria-hidden="true" />
                            <input
                                ref={searchInputRef}
                                id={mobileSearchInputId}
                                type="search"
                                placeholder="Buscar producto..."
                                className={`h-full w-full min-w-0 bg-transparent pl-9 pr-10 ${textScale.body} text-gc-text outline-none placeholder:text-gc-text-muted [&::-webkit-search-cancel-button]:hidden`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') closeMobileSearch();
                                }}
                                disabled={searchPhase === 'closing'}
                            />
                            <button
                                type="button"
                                onClick={closeMobileSearch}
                                className="absolute right-1 flex h-7 w-7 items-center justify-center rounded-full text-gc-text-muted transition-colors hover:bg-gc-muted hover:text-gc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent/30"
                                aria-label="Cerrar búsqueda"
                                disabled={searchPhase === 'closing'}
                            >
                                <X size={15} aria-hidden="true" />
                            </button>
                        </div>
                    ) : (
                        <>
                            {sidebarCategories.length > 0 ? (
                                <nav
                                    ref={categoriesNavRef}
                                    className="manual-order-catalog-categories manual-order-catalog-categories--enter flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scroll-smooth py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                                    aria-label="Categorías"
                                >
                                    {sidebarCategories.map((it) => {
                                        const isActive = activeCategory === it.key;
                                        return (
                                            <button
                                                key={it.key}
                                                ref={setCategoryChipRef(it.key)}
                                                type="button"
                                                onClick={() => scrollToCategory(it.key)}
                                                className={cn(
                                                    `manual-order-catalog-category-chip shrink-0 snap-start whitespace-nowrap border px-3.5 py-2 sm:py-1.5 ${pillRadiusClass} ${textScale.body} leading-snug transition-all`,
                                                    isActive
                                                        ? 'border-gc-text bg-gc-text font-semibold text-white shadow-sm'
                                                        : 'border-gc-border bg-gc-card font-medium text-gc-text-muted hover:border-gc-text/20 hover:bg-gc-muted hover:text-gc-text',
                                                )}
                                                aria-current={isActive ? 'true' : undefined}
                                            >
                                                {it.name}
                                            </button>
                                        );
                                    })}
                                </nav>
                            ) : (
                                <div className="min-w-0 flex-1" />
                            )}

                            <Button
                                variant="default"
                                type="button"
                                onClick={openMobileSearch}
                                className={cn(
                                    `manual-order-catalog-search-toggle relative flex h-10 w-10 shrink-0 items-center justify-center ${pillRadiusClass} border p-0 shadow-none transition-colors`,
                                    hasActiveSearch
                                        ? 'border-gc-accent/30 bg-gc-accent/10 text-gc-accent'
                                        : 'border-gc-border bg-gc-card text-gc-text-muted hover:border-gc-text/20 hover:bg-gc-muted hover:text-gc-text',
                                )}
                                aria-label="Buscar productos"
                                aria-expanded={false}
                                title="Buscar"
                            >
                                <Search size={18} aria-hidden="true" />
                                {hasActiveSearch ? (
                                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gc-accent" aria-hidden="true" />
                                ) : null}
                            </Button>
                        </>
                    )}
                </div>
                <div
                    ref={catalogScrollRef}
                    className="manual-order-categories-scroll flex-1 overflow-y-auto rounded-[22px] border border-gc-border bg-gc-muted px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-7"
                >
                    {!hasAnyResults ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gc-muted">
                                <PackageX size={28} className="text-gc-text-muted" />
                            </div>
                            <div>
                                <p className={`${textScale.emphasis} font-bold text-gc-text`}>No se encontraron productos</p>
                                <p className={`${textScale.body} text-gc-text-muted`}>Probá con otra búsqueda o categoría.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div ref={productsSectionRef}>
                                {renderCatalogSection(groupedBaseCatalog, 'products')}
                            </div>
                            {hasBeveragesSection ? (
                                <div ref={beveragesSectionRef}>
                                    {renderCatalogSection(groupedBeverageCatalog, 'beverages')}
                                </div>
                            ) : null}
                            {hasExtrasSection ? (
                                <div ref={extrasSectionRef}>
                                    {renderCatalogSection(groupedExtrasCatalog, 'extras')}
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(ManualOrderCatalog);
