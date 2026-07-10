import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Columns3, Maximize2 } from 'lucide-react';
import AdminIconSlot from './AdminIconSlot';
import OrderCard from './OrderCard';
import { Button } from "@/components/ui/button";

const KANBAN_VIEW_STORAGE_KEY = 'tenant-admin-kanban-view';

/** Reordena un array para que, al renderizarse con CSS column-count,
 * la lectura sea horizontal (por filas) en lugar de vertical (por columnas).
 *  Items: [1,2,3,4,5,6], cols: 3  →  [1,4,2,5,3,6]
 *  Visual result:
 *    1  2  3
 *    4  5  6 */
function reorderForHorizontalColumns(items, columnCount) {
    if (!items || columnCount <= 1) return items;
    const cols = Array.from({ length: columnCount }, () => []);
    items.forEach((item, i) => {
        cols[i % columnCount].push(item);
    });
    return cols.flat();
}

const AdminKanban = ({ columns, isMobile, mobileTab, setMobileTab, moveOrder, setReceiptModalOrder, branch, clients, logoUrl, companyName, showNotify, products, categories, onOrderSaved, localOrderChannels = null }) => {

    const [mounted, setMounted] = useState(false);
    /** 'split' = tres columnas; 'single' = una etapa a pantalla completa (solo escritorio; móvil sigue en pestañas) */
    const [kanbanViewMode, setKanbanViewModeState] = useState('split');
    const [focusColumnCount, setFocusColumnCount] = useState(() => {
        if (typeof window === 'undefined') return 1;
        if (window.matchMedia('(min-width: 1540px)').matches) return 4;
        if (window.matchMedia('(min-width: 1240px)').matches) return 3;
        if (window.matchMedia('(min-width: 940px)').matches) return 2;
        return 1;
    });
    const focusBodyRef = useRef(null);

    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        try {
            const v = localStorage.getItem(KANBAN_VIEW_STORAGE_KEY);
            if (v === 'single' || v === 'split') {
                queueMicrotask(() => setKanbanViewModeState(v));
            }
        } catch {
            /* ignore */
        }
    }, []);

    const setKanbanViewMode = useCallback((mode) => {
        setKanbanViewModeState(mode);
        try {
            localStorage.setItem(KANBAN_VIEW_STORAGE_KEY, mode);
        } catch {
            /* ignore */
        }
    }, []);

    // 1. CONFIGURACIÓN CENTRALIZADA
    // Aquí defines tus columnas. Si quieres agregar una, solo la pones aquí y listo.
    const columnConfig = useMemo(() => [
        { 
            id: 'pending', 
            title: 'ENTRANTES', 
            shortTitle: 'Entrantes', // Para el botón móvil
            dotClass: 'dot-orange', 
            emptyMsg: 'Sin pedidos' 
        },
        { 
            id: 'active', 
            title: 'COCINANDO', 
            shortTitle: 'Cocina', 
            dotClass: 'dot-red', 
            emptyMsg: 'Cocina libre' 
        },
        { 
            id: 'completed', 
            title: 'LISTOS', 
            shortTitle: 'Listos', 
            dotClass: 'dot-green', 
            emptyMsg: 'Nada listo' 
        }
    ], []);

    const showDesktopSingle = mounted && !isMobile && kanbanViewMode === 'single';
    const showDesktopSplit = mounted && !isMobile && kanbanViewMode === 'split';

    /* En modo focus leemos directamente cuántas columnas está pintando CSS
       (getComputedStyle columnCount) para reordenar las cards y que la
       numeración se lea horizontalmente. Así nunca hay desfase con el layout. */
    useEffect(() => {
        if (!showDesktopSingle || typeof window === 'undefined') return;

        const updateCount = () => {
            const el = focusBodyRef.current;
            if (!el) return;
            const style = window.getComputedStyle(el);
            const raw = style.columnCount || style.columns || '1';
            const count = parseInt(raw, 10);
            setFocusColumnCount(Number.isFinite(count) && count > 0 ? count : 1);
        };

        updateCount();
        const ro = new ResizeObserver(updateCount);
        if (focusBodyRef.current) ro.observe(focusBodyRef.current);
        window.addEventListener('resize', updateCount);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', updateCount);
        };
    }, [showDesktopSingle]);

    const isColumnHidden = (colId) => {
        if (!mounted) return false;
        if (isMobile && mobileTab !== colId) return true;
        if (showDesktopSingle && mobileTab !== colId) return true;
        return false;
    };

    return (
        <>
            {!isMobile && (
                <div className="kanban-view-toolbar" role="group" aria-label="Vista del tablero de pedidos">
                    <span className="kanban-view-toolbar-label">Vista</span>
                    <div className="kanban-view-toggle">
                        <Button variant="default"
                            type="button"
                            className={kanbanViewMode === 'split' ? 'active' : ''}
                            onClick={() => setKanbanViewMode('split')}
                            aria-pressed={kanbanViewMode === 'split'}
                            title="Ver entrantes, cocinando y listos a la vez"
                        >
                            <Columns3 size={16} strokeWidth={2.25} aria-hidden />
                            Tres columnas
                        </Button>
                        <Button variant="default"
                            type="button"
                            className={kanbanViewMode === 'single' ? 'active' : ''}
                            onClick={() => setKanbanViewMode('single')}
                            aria-pressed={kanbanViewMode === 'single'}
                            title="Una etapa a la vez, ancho completo"
                        >
                            <AdminIconSlot Icon={Maximize2} slotSize="sm" />
                            Una columna
                        </Button>
                    </div>
                </div>
            )}

            {/* Pestañas: móvil siempre; escritorio solo en vista una columna */}
            <div className={`mobile-tabs ${showDesktopSingle ? 'kanban-tabs-desktop' : ''}`}>
                {columnConfig.map(col => (
                    <Button variant="default"
                        key={col.id}
                        type="button"
                        onClick={() => setMobileTab(col.id)}
                        className={mobileTab === col.id ? 'active' : ''}
                    >
                        {col.shortTitle} ({columns[col.id]?.length || 0})
                    </Button>
                ))}
            </div>

            {/* Tablero */}
            <div
                className={[
                    'kanban-board',
                    showDesktopSingle ? 'kanban-board--focus-desktop' : '',
                    showDesktopSplit ? 'kanban-board--split-desktop' : '',
                ].filter(Boolean).join(' ')}
            >
                {columnConfig.map((col) => {
                    const rawList = columns[col.id] || [];
                    const sortedList = showDesktopSingle
                        ? [...rawList].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                        : rawList;
                    const ordersInColumn = showDesktopSingle
                        ? reorderForHorizontalColumns(sortedList, focusColumnCount)
                        : sortedList;
                    const hidden = isColumnHidden(col.id);

                    return (
                        <div
                            key={col.id}
                            className={`kanban-column col-${col.id} ${hidden ? 'kanban-column--hidden' : ''}`}
                        >
                            {/* Header */}
                            <div className="column-header">
                                <span className={`dot ${col.dotClass}`}></span>
                                <h3>{col.title}</h3>
                                <span className="count">{ordersInColumn.length}</span>
                            </div>

                            {/* Body */}
                            <div
                                className="column-body"
                                ref={showDesktopSingle && !hidden ? focusBodyRef : null}
                            >
                                {ordersInColumn.length === 0 ? (
                                    <div className="empty-zone">{col.emptyMsg}</div>
                                ) : (
                                    ordersInColumn.map((order, idx) => (
                                        <OrderCard
                                            key={order.id}
                                            order={order}
                                            queueIndex={idx + 1}
                                            moveOrder={moveOrder}
                                            setReceiptModalOrder={setReceiptModalOrder}
                                            branch={branch}
                                            clients={clients}
                                            logoUrl={logoUrl}
                                            companyName={companyName}
                                            showNotify={showNotify}
                                            products={products}
                                            categories={categories}
                                            onOrderSaved={onOrderSaved}
                                            localOrderChannels={localOrderChannels}
                                            gridTile={showDesktopSingle}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
};

export default React.memo(AdminKanban);
