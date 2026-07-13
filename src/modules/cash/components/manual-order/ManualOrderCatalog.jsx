import React, { useState, useMemo, useRef, useDeferredValue, useEffect } from 'react';
import { Search, ImageOff, Image, PackageX } from 'lucide-react';
import { cn } from '@/lib/utils';
import ProductCard from './ProductCard';
import { Button } from "@/components/ui/button";
import { selectedToggleActiveClass, catalogGridGapClass, spacing, textScale, pillRadiusClass } from './manualOrderStyles';

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
    const [showProductImages, setShowProductImages] = useState(false);
    const [activeCategory, setActiveCategory] = useState(null);

    const catalogScrollRef = useRef(null);
    const productsSectionRef = useRef(null);
    const beveragesSectionRef = useRef(null);
    const extrasSectionRef = useRef(null);
    const categoryRefsRef = useRef(new Map());

    const setCategoryRef = (key) => (el) => {
        if (el) categoryRefsRef.current.set(key, el);
        else categoryRefsRef.current.delete(key);
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

    const renderCatalogSection = (catalog, variant = 'products') => {
        if (!catalog || (catalog.groupedCategories.length === 0 && catalog.uncategorized.length === 0)) return null;

        return (
            <section className="mb-10 last:mb-0">
                {catalog.groupedCategories.map((cat) => {
                    const navKey = buildCategoryNavKey(variant, cat.id);
                    return (
                        <div
                            key={`${variant}-${normalizeCategoryId(cat.id)}`}
                            className="mb-6"
                            data-category-key={navKey}
                            ref={setCategoryRef(navKey)}
                        >
                            <h3 className={`mb-3 flex items-center gap-2 ${textScale.emphasis} font-bold text-gc-text`}>
                                <span className="h-4 w-0.5 rounded-full bg-gc-accent" aria-hidden />
                                {cat.name}
                                <span className={`rounded-full bg-gc-muted px-1.5 py-0.5 ${textScale.micro} font-semibold text-gc-text-muted`}>
                                    {cat.products.length}
                                </span>
                            </h3>
                            <div className={`grid grid-cols-1 ${catalogGridGapClass} min-[400px]:grid-cols-2 min-[880px]:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]`}>
                                {cat.products.map((p) => (
                                    <ProductCard
                                        key={p.id}
                                        product={p}
                                        quantity={getQty(p.id)}
                                        addItem={addItem}
                                        updateQuantity={updateQuantity}
                                        removeItem={removeItem}
                                        showProductImages={showProductImages}
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
                        className="mb-6"
                        data-category-key={buildCategoryNavKey(variant, '__uncat__')}
                        ref={setCategoryRef(buildCategoryNavKey(variant, '__uncat__'))}
                    >
                        <h3 className={`mb-3 flex items-center gap-2 ${textScale.emphasis} font-bold text-gc-text`}>
                            <span className="h-4 w-0.5 rounded-full bg-gc-text-muted" aria-hidden />
                            Otros
                            <span className={`rounded-full bg-gc-muted px-1.5 py-0.5 ${textScale.micro} font-semibold text-gc-text-muted`}>
                                {catalog.uncategorized.length}
                            </span>
                        </h3>
                        <div className={`grid grid-cols-1 ${catalogGridGapClass} min-[400px]:grid-cols-2 min-[880px]:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]`}>
                            {catalog.uncategorized.map((p) => (
                                <ProductCard
                                    key={p.id}
                                    product={p}
                                    quantity={getQty(p.id)}
                                    addItem={addItem}
                                    updateQuantity={updateQuantity}
                                    removeItem={removeItem}
                                    showProductImages={showProductImages}
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

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="mb-4 flex flex-col gap-3 border-b border-gc-border/60 pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h2 className={`${textScale.emphasis} font-bold text-gc-text`}>Productos disponibles</h2>
                    <p className={`mt-0.5 ${textScale.micro} text-gc-text-muted`}>
                        {totalItems} {totalItems === 1 ? 'ítem' : 'ítems'} en catálogo
                    </p>
                </div>

                <div className={`flex w-full flex-col ${spacing.compact} sm:w-auto sm:flex-row sm:flex-wrap sm:items-center`}>
                    <div className="relative flex w-full min-w-0 items-center sm:w-auto">
                        <Search size={15} className="pointer-events-none absolute left-3.5 text-gc-text-muted" />
                        <input
                            type="text"
                            placeholder="Buscar producto..."
                            className={`h-10 w-full min-w-0 ${pillRadiusClass} bg-gc-muted pl-10 pr-4 ${textScale.body} text-gc-text transition-all placeholder:text-gc-text-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-gc-accent/15 sm:w-56`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <Button variant="default"
                        type="button"
                        onClick={() => setShowProductImages((v) => !v)}
                        className={`flex h-9 items-center gap-1.5 rounded-[4px] border px-3 ${textScale.micro} font-semibold transition-colors ${
                            showProductImages
                                ? 'border-gc-accent bg-gc-accent/10 text-gc-accent'
                                : 'border-gc-border bg-gc-card text-gc-text-muted hover:border-gc-accent/30 hover:text-gc-text'
                        }`}
                        aria-pressed={showProductImages}
                    >
                        {showProductImages ? <Image size={15} /> : <ImageOff size={15} />}
                        Imágenes
                    </Button>
                </div>
            </div>

            {/* Layout */}
            <div className={`flex min-h-0 flex-1 flex-col ${spacing.normal}`}>
                {sidebarCategories.length > 0 && (
                    <nav className="flex items-center gap-5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" aria-label="Categorías">
                        {sidebarCategories.map((it) => {
                            const isActive = activeCategory === it.key;
                            return (
                                <button
                                    key={it.key}
                                    type="button"
                                    onClick={() => scrollToCategory(it.key)}
                                    className={cn(
                                        `whitespace-nowrap ${textScale.body} transition-colors`,
                                        isActive
                                            ? 'font-bold text-gc-text'
                                            : 'font-medium text-gc-text-muted hover:text-gc-text',
                                    )}
                                    aria-current={isActive ? 'true' : undefined}
                                >
                                    {it.name}
                                </button>
                            );
                        })}
                    </nav>
                )}

                <div
                    ref={catalogScrollRef}
                    className="manual-order-categories-scroll flex-1 overflow-y-auto rounded-[4px] border border-gc-border bg-gc-page px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-7"
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