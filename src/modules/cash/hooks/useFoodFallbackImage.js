import React from 'react';
import { getFoodFallbackImageUrl } from '@/modules/cash/utils/foodFallbackImage';

/**
 * Hook wrapper de getFoodFallbackImageUrl para componentes React.
 * Devuelve una ruta local de imagen de fallback para productos sin foto.
 */
export function useFoodFallbackImage(categoryName, productId, enabled) {
    const url = React.useMemo(
        () => (enabled ? getFoodFallbackImageUrl(categoryName, productId) : null),
        [enabled, categoryName, productId],
    );

    return { url, failed: false };
}
