/** Imagen referencial única para productos del menú sin foto (public/referent_product.png). */
export const PRODUCT_IMAGE_FALLBACK = '/referent_product.png';

export const FOOD_FALLBACK_COUNT = 1;
export const DRINK_FALLBACK_COUNT = 1;
export const DESSERT_FALLBACK_COUNT = 1;

/**
 * Devuelve la imagen referencial local para productos sin foto.
 * Antes rotaba entre /public/food-fallbacks/; ahora usa un único asset de marca.
 */
export function getFoodFallbackImageUrl(_categoryName, _productId) {
	return PRODUCT_IMAGE_FALLBACK;
}
