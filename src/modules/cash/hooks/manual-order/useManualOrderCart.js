import { useState, useCallback, useMemo } from 'react';
import { getEffectiveItemPrice } from './manualOrderShared';
import { majorToMinor, minorToMajor, sumMinor } from '@/lib/money/minor-units';

/**
 * Hook especializado en gestionar los ítems agregados al pedido manual,
 * cantidades, precios (con o sin descuento), notas por producto y cálculo del total.
 */
const normalizeItemId = (id) => (id == null ? '' : String(id));

export const useManualOrderCart = (initialItems = [], options = {}) => {
    const [items, setItems] = useState(initialItems);

    const getPrice = useCallback((product) => getEffectiveItemPrice(product), []);

    // Calcular total bruto del carrito
	const totalMinor = useMemo(() => sumMinor(items.map((item) => (
		majorToMinor(getPrice(item), options.currency ?? 'CLP', options.fractionDigits) * item.quantity
	))), [items, getPrice, options.currency, options.fractionDigits]);
	const total = useMemo(
		() => minorToMajor(totalMinor, options.currency ?? 'CLP', options.fractionDigits),
		[totalMinor, options.currency, options.fractionDigits],
	);

    // Añadir producto al carrito
    const addItem = useCallback((product) => {
        const productId = normalizeItemId(product?.id);
        if (!productId) return;

        setItems(currentItems => {
            const exists = currentItems.find(i => normalizeItemId(i.id) === productId);
            if (exists) {
				if (exists.quantity >= 20) {
					options.onLimitReached?.(exists);
					return currentItems;
				}
                return currentItems.map(i => (
                    normalizeItemId(i.id) === productId ? { ...i, quantity: i.quantity + 1 } : i
                ));
            } else {
                return [...currentItems, {
                    id: productId,
                    name: product.name,
                    price: product.price,
                    has_discount: product.has_discount,
                    discount_price: product.discount_price,
                    image_url: product.image_url,
                    description: product.description,
                    quantity: 1,
                    note: '',
                    manual_order_source: product.manual_order_source || null,
                    is_extra: product.manual_order_source === 'extras' || product.is_extra
                }];
            }
        });
	}, [options.onLimitReached]);

    // Actualizar cantidad (+1 o -1)
    const updateQuantity = useCallback((itemId, change) => {
        const key = normalizeItemId(itemId);
        setItems(currentItems => {
            const item = currentItems.find(i => normalizeItemId(i.id) === key);
            if (!item) return currentItems;
			if (change > 0 && item.quantity >= 20) {
				options.onLimitReached?.(item);
				return currentItems;
			}

            if (item.quantity + change < 1) {
                return currentItems.map(i => (normalizeItemId(i.id) === key ? { ...i, quantity: 1 } : i));
            } else {
                return currentItems.map(i => (
                    normalizeItemId(i.id) === key ? { ...i, quantity: i.quantity + change } : i
                ));
            }
        });
	}, [options.onLimitReached]);

    // Eliminar producto del carrito
    const removeItem = useCallback((itemId) => {
        const key = normalizeItemId(itemId);
        setItems(currentItems => currentItems.filter(i => normalizeItemId(i.id) !== key));
    }, []);

    // Guardar una nota/especificación de cocina para un producto específico
    const updateItemNote = useCallback((itemId, note) => {
        const key = normalizeItemId(itemId);
        const next = typeof note === 'string' ? note.slice(0, 140) : '';
        setItems(currentItems => currentItems.map(i => (
            normalizeItemId(i.id) === key ? { ...i, note: next } : i
        )));
    }, []);

    // Reiniciar por completo el carrito
	const resetCart = useCallback(() => {
		setItems([]);
	}, []);

	const restoreCart = useCallback((nextItems) => {
		setItems(Array.isArray(nextItems) ? nextItems : []);
	}, []);

    return {
		items,
		total,
		totalMinor,
        addItem,
        updateQuantity,
        removeItem,
        updateItemNote,
		resetCart,
		restoreCart,
        getPrice
    };
};
