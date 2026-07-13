export const FOOD_FALLBACK_COUNT = 10;
export const DRINK_FALLBACK_COUNT = 7;
export const DESSERT_FALLBACK_COUNT = 9;

const DRINK_KEYWORDS = [
    'bebida', 'refresco', 'jugo', 'agua', 'cafe', 'café', 'té', 'tea', 'limonada',
    'smoothie', 'batido', 'malteada', 'coca', 'pepsi', 'gaseosa', 'soda', 'fanta',
    'sprite', 'energética', 'vodka', 'cerveza', 'vino', 'whisky', 'ron', 'coctel', 'cóctel',
];

const DESSERT_KEYWORDS = [
    'postre', 'dulce', 'helado', 'cake', 'pastel', 'torta', 'galleta', 'brownie',
    'flan', 'crema', 'mousse', 'donut', 'churro', 'alfajor', 'tiramisu', 'cupcake',
    'cheesecake', 'pie', 'tartaleta', 'merengue', 'muffin',
];

function normalize(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

function getBucket(categoryName) {
    const norm = normalize(categoryName);
    if (DRINK_KEYWORDS.some((k) => norm.includes(k))) return 'drink';
    if (DESSERT_KEYWORDS.some((k) => norm.includes(k))) return 'dessert';
    return 'food';
}

/**
 * Devuelve una ruta local de imagen de fallback para productos sin foto.
 * Las imágenes están en /public/food-fallbacks/ y se eligen de forma
 * determinista según el id del producto, para que cada producto tenga una
 * foto distinta y estable.
 */
export function getFoodFallbackImageUrl(categoryName, productId) {
    const bucket = getBucket(categoryName);
    const seed = String(productId || categoryName || 'default');

    let prefix;
    let count;
    switch (bucket) {
        case 'drink':
            prefix = 'drink';
            count = DRINK_FALLBACK_COUNT;
            break;
        case 'dessert':
            prefix = 'dessert';
            count = DESSERT_FALLBACK_COUNT;
            break;
        default:
            prefix = 'food';
            count = FOOD_FALLBACK_COUNT;
    }

    const index = hashString(seed) % count;
    return `/food-fallbacks/${prefix}-${index}.jpg`;
}
