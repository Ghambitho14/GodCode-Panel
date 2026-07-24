import { supabase } from '@/integrations/supabase/client';

const MAX_SIZE_MB = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const SUPABASE_STORAGE_URL_PATTERN = /\/storage\/v1\/(?:object|render\/image)\//i;
const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function createClientUuid() {
    const randomUuid = globalThis.crypto?.randomUUID;
    if (typeof randomUuid === 'function') return randomUuid.call(globalThis.crypto);

    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (char) => (
        Number(char) ^ Math.floor(Math.random() * 16) >> Number(char) / 4
    ).toString(16));
}

export const STORAGE_BUCKETS = Object.freeze({
    MENU: 'menu',
    RECEIPTS: 'receipts',
    PRODUCTS: 'products',
});

export const IMAGE_STORAGE_CONTEXTS = Object.freeze({
    CATALOG_PRODUCT: 'catalog-product',
    CART_UPSELL: 'cart-upsell',
    MENU_CAROUSEL: 'menu-carousel',
    STOREFRONT_BRANDING: 'storefront-branding',
    ORDER_RECEIPT: 'order-receipt',
});

const STORAGE_CONTEXT_BUCKETS = Object.freeze({
    [IMAGE_STORAGE_CONTEXTS.CATALOG_PRODUCT]: STORAGE_BUCKETS.MENU,
    [IMAGE_STORAGE_CONTEXTS.CART_UPSELL]: STORAGE_BUCKETS.MENU,
    [IMAGE_STORAGE_CONTEXTS.MENU_CAROUSEL]: STORAGE_BUCKETS.MENU,
    [IMAGE_STORAGE_CONTEXTS.STOREFRONT_BRANDING]: STORAGE_BUCKETS.MENU,
    [IMAGE_STORAGE_CONTEXTS.ORDER_RECEIPT]: STORAGE_BUCKETS.RECEIPTS,
});

function requiredPathSegment(value, label) {
    const segment = String(value || '').trim();
    if (!segment) throw new Error(`Falta ${label} para organizar la imagen`);
    if (!SAFE_PATH_SEGMENT.test(segment) || segment === '.' || segment === '..') {
        throw new Error(`${label} no es válido para una ruta de Storage`);
    }
    return segment;
}

function optionalPathSegments(value, label) {
    if (value == null || value === '') return [];
    return String(value)
        .split('/')
        .filter(Boolean)
        .map((segment) => requiredPathSegment(segment, label));
}

/**
 * Indica si una URL completa pertenece a Supabase Storage, incluido el proxy BFF.
 *
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
export function isSupabaseStorageUrl(value) {
    const trimmed = String(value || '').trim();
    return /^https?:\/\//i.test(trimmed) && SUPABASE_STORAGE_URL_PATTERN.test(trimmed);
}

/**
 * Construye una ruta de carpeta dentro de un bucket agrupada por empresa.
 * `companyId` es obligatorio: nunca se permite una carpeta global compartida.
 *
 * @param {string | null | undefined} companyId
 * @param {string} [subFolder] - Subcarpeta opcional (p.ej. 'carousel/{branchId}', 'upsell').
 * @returns {string}
 */
export function companyStorageFolder(companyId, ...subFolders) {
    const base = requiredPathSegment(companyId, 'companyId');
    const nested = subFolders.flatMap((value) => optionalPathSegments(value, 'subcarpeta'));
    return [base, ...nested].join('/');
}

/**
 * Devuelve bucket y carpeta según el tipo de imagen que se va a almacenar.
 * Esta función es la fuente única de la taxonomía de Storage del frontend.
 *
 * @param {string} context
 * @param {{
 *   companyId: string,
 *   branchId?: string | null,
 *   entityId?: string | null,
 *   variant?: 'beverages' | 'extras' | string,
 *   now?: Date,
 * }} options
 * @returns {{ bucket: 'menu' | 'receipts' | 'products', folder: string }}
 */
export function getCompanyImageStorageTarget(context, options = {}) {
    const bucket = STORAGE_CONTEXT_BUCKETS[context];
    if (!bucket) throw new Error(`Contexto de imagen no soportado: ${String(context || '')}`);

    const companyId = requiredPathSegment(options.companyId, 'companyId');
    const branchId = options.branchId
        ? requiredPathSegment(options.branchId, 'branchId')
        : null;
    const entityId = options.entityId
        ? requiredPathSegment(options.entityId, 'entityId')
        : null;

    if (context === IMAGE_STORAGE_CONTEXTS.CATALOG_PRODUCT) {
        return {
            bucket,
            folder: companyStorageFolder(companyId, 'catalog/products', entityId || 'drafts'),
        };
    }

    if (context === IMAGE_STORAGE_CONTEXTS.CART_UPSELL) {
        if (!branchId) throw new Error('Falta branchId para organizar la imagen del carrito');
        if (!entityId) throw new Error('Falta entityId para organizar la imagen del carrito');
        const variant = requiredPathSegment(options.variant, 'variant');
        if (!['beverages', 'extras'].includes(variant)) {
            throw new Error('Variant de carrito no soportada');
        }
        return {
            bucket,
            folder: companyStorageFolder(companyId, 'cart-upsell', branchId, variant, entityId),
        };
    }

    if (context === IMAGE_STORAGE_CONTEXTS.MENU_CAROUSEL) {
        if (!branchId) throw new Error('Falta branchId para organizar el carrusel');
        return {
            bucket,
            folder: companyStorageFolder(companyId, 'storefront/carousel', branchId),
        };
    }

    if (context === IMAGE_STORAGE_CONTEXTS.STOREFRONT_BRANDING) {
        const variant = requiredPathSegment(options.variant, 'variant');
        if (!['logo', 'background'].includes(variant)) {
            throw new Error('Variant de identidad visual no soportada');
        }
        return {
            bucket,
            folder: companyStorageFolder(companyId, 'storefront/branding', variant),
        };
    }

    if (!branchId) throw new Error('Falta branchId para organizar el comprobante');
    const now = options.now instanceof Date ? options.now : new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return {
        bucket,
        folder: companyStorageFolder(
            companyId,
            'orders',
            branchId,
            'receipts',
            year,
            month,
            entityId || 'pending',
        ),
    };
}

/**
 * Sube una imagen usando una ruta empresarial tipada por contexto.
 */
export async function uploadCompanyImage(file, context, options) {
    const target = getCompanyImageStorageTarget(context, options);
    return uploadImageToSupabase(file, target.bucket, target.folder);
}

export function validateImageFile(file) {
    if (!file) return { valid: false, error: 'No se seleccionó ningún archivo.' };
    if (!ALLOWED_TYPES.includes(file.type)) {
        return { valid: false, error: 'Formato no soportado. Usá JPG, PNG, WebP o GIF.' };
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        return { valid: false, error: `El archivo supera los ${MAX_SIZE_MB} MB.` };
    }
    return { valid: true, error: null };
}

function getFileExtension(file) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && ext.length <= 5) return ext;
    const map = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
    };
    return map[file.type] || 'jpg';
}

/**
 * Sube una imagen a Supabase Storage.
 *
 * @param {File} file - Archivo de imagen.
 * @param {'menu' | 'receipts' | 'products'} bucket - Bucket destino.
 * @param {string} [folder=''] - Carpeta opcional dentro del bucket.
 * @returns {Promise<string>} Ruta relativa del archivo dentro del bucket (p.ej. "menu/uuid.png").
 */
export async function uploadImageToSupabase(file, bucket, folder = '') {
    const validation = validateImageFile(file);
    if (!validation.valid) throw new Error(validation.error);

    if (!Object.values(STORAGE_BUCKETS).includes(bucket)) {
        throw new Error(`Bucket "${bucket}" no válido.`);
    }
    if (!folder) {
        throw new Error('Toda imagen debe incluir una carpeta raíz por companyId');
    }

    const normalizedFolder = companyStorageFolder(
        String(folder).split('/')[0],
        String(folder).split('/').slice(1).join('/'),
    );

    const ext = getFileExtension(file);
    const fileName = `${normalizedFolder}/${createClientUuid()}.${ext}`;

    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: file.type,
        });

    if (error) {
        throw new Error(error.message || 'Error al subir imagen a Supabase');
    }

    return data.path;
}

/**
 * Reescribe URLs de Storage al base URL del cliente (incluye proxy BFF `/api/supabase`).
 * Evita hosts internos de Docker / IP privadas que el navegador no puede abrir.
 *
 * @param {string | null | undefined} assetUrl
 * @returns {string | null}
 */
export function normalizeStorageAssetUrl(assetUrl) {
    if (!assetUrl) return null;
    const trimmed = String(assetUrl).trim();
    if (!trimmed) return null;

    let clientBase = '';
    try {
        const raw = String(
            import.meta.env.VITE_SUPABASE_URL
            ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL
            ?? '',
        ).trim();
        if (raw.startsWith('/')) {
            if (typeof window !== 'undefined' && window.location?.origin) {
                clientBase = `${window.location.origin}${raw}`.replace(/\/$/, '');
            }
        } else if (raw) {
            clientBase = raw.replace(/\/$/, '');
        }
    } catch {
        clientBase = '';
    }
    if (!clientBase) return trimmed;

    try {
        if (trimmed.startsWith('/storage/v1/')) {
            return `${clientBase}${trimmed}`;
        }
        if (trimmed.startsWith('/object/') || trimmed.startsWith('/render/')) {
            return `${clientBase}/storage/v1${trimmed}`;
        }
        const parsed = new URL(trimmed);
        const marker = parsed.pathname.indexOf('/storage/v1/');
        if (marker === -1) return trimmed;
        return `${clientBase}${parsed.pathname.slice(marker)}${parsed.search}`;
    } catch {
        return trimmed;
    }
}

/**
 * Devuelve una URL firmada (o pública) para un archivo de Supabase Storage.
 * Si el valor ya es una URL completa de Supabase Storage, la normaliza al base del cliente.
 *
 * @param {string | null | undefined} pathOrUrl - Ruta relativa del archivo o URL completa.
 * @param {'menu' | 'receipts' | 'products'} bucket - Bucket.
 * @param {number} [expiresIn=3600] - Segundos de validez de la URL firmada.
 * @returns {Promise<string | null>} URL usable en <img src>.
 */
export async function getSignedImageUrl(pathOrUrl, bucket, expiresIn = 3600) {
    if (!pathOrUrl) return null;
    const trimmed = String(pathOrUrl).trim();
    if (/^https?:\/\//i.test(trimmed) && !isSupabaseStorageUrl(trimmed)) {
        throw new Error('La imagen no pertenece a Supabase Storage');
    }
    const storagePath = extractStoragePath(trimmed, bucket);
    if (!storagePath || /^https?:\/\//i.test(storagePath)) {
        throw new Error('La ruta del archivo no es válida');
    }

    // `menu` es público en este proyecto: la URL pública evita fallos de sign/RLS
    // y sigue pasando por el mismo host/proxy del cliente.
    if (bucket === STORAGE_BUCKETS.MENU) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
        const publicUrl = normalizeStorageAssetUrl(data?.publicUrl);
        if (publicUrl) return publicUrl;
    }

    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, expiresIn);

    if (error) {
        throw new Error(error.message || 'Error al generar URL firmada');
    }

    return normalizeStorageAssetUrl(data?.signedUrl);
}

/**
 * Extrae la ruta relativa de un archivo dentro de un bucket a partir de una
 * URL pública de Supabase Storage. Si el valor no es una URL de Supabase,
 * devuelve el valor original.
 *
 * @param {string} urlOrPath - URL pública o ruta relativa.
 * @param {'menu' | 'receipts' | 'products'} bucket - Bucket.
 * @returns {string} Ruta relativa o valor original.
 */
export function extractStoragePath(urlOrPath, bucket) {
    if (!urlOrPath) return urlOrPath;
    const trimmed = String(urlOrPath).trim();
    if (!/^https?:\/\//i.test(trimmed)) {
        return trimmed.startsWith(`${bucket}/`) ? trimmed.slice(bucket.length + 1) : trimmed;
    }
    if (!isSupabaseStorageUrl(trimmed)) return trimmed;

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(trimmed).pathname);
    } catch {
        return trimmed;
    }
    const markers = [
        `/storage/v1/object/public/${bucket}/`,
        `/storage/v1/object/sign/${bucket}/`,
        `/storage/v1/object/authenticated/${bucket}/`,
        `/storage/v1/render/image/public/${bucket}/`,
        `/storage/v1/render/image/sign/${bucket}/`,
        `/storage/v1/render/image/authenticated/${bucket}/`,
    ];
    const marker = markers.find((candidate) => pathname.includes(candidate));
    return marker ? pathname.slice(pathname.indexOf(marker) + marker.length) : trimmed;
}

/** Distingue una ruta real de Storage de textos legacy como "Pago Presencial". */
export function isStorageObjectReference(value, bucket) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return false;
    if (/^https?:\/\//i.test(trimmed) && !isSupabaseStorageUrl(trimmed)) return false;
    const path = extractStoragePath(trimmed, bucket);
    if (!path || /^https?:\/\//i.test(path) || !path.includes('/')) return false;
    return /\.(?:jpe?g|png|webp|gif)$/i.test(path);
}

/**
 * Comprueba que una ruta relativa pertenezca a la raíz de la empresa indicada.
 */
export function isCompanyStoragePath(pathOrUrl, bucket, companyId) {
    const path = extractStoragePath(pathOrUrl, bucket);
    if (!path || /^https?:\/\//i.test(path)) return false;
    const companyRoot = `${requiredPathSegment(companyId, 'companyId')}/`;
    return path.startsWith(companyRoot);
}

/**
 * Elimina un archivo de Supabase Storage de forma silenciosa.
 *
 * @param {string | null | undefined} pathOrUrl - Ruta relativa o URL pública del archivo.
 * @param {'menu' | 'receipts' | 'products'} bucket - Bucket.
 * @returns {Promise<void>}
 */
export async function deleteStorageObject(pathOrUrl, bucket) {
    if (!pathOrUrl) return;
    const path = extractStoragePath(pathOrUrl, bucket);
    if (!path) return;
    // No intentar borrar URLs externas o firmadas.
    if (/^https?:\/\//i.test(path)) return;

    try {
        const { error } = await supabase.storage.from(bucket).remove([path]);
        if (error) {
            // eslint-disable-next-line no-console
            console.warn('[deleteStorageObject]', error.message);
        }
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[deleteStorageObject]', err instanceof Error ? err.message : err);
    }
}


/**
 * Elimina una imagen únicamente si pertenece a la carpeta de la empresa.
 */
export async function deleteCompanyImage(pathOrUrl, context, companyId) {
    if (!pathOrUrl) return;
    const bucket = STORAGE_CONTEXT_BUCKETS[context];
    if (!bucket) throw new Error(`Contexto de imagen no soportado: ${String(context || '')}`);
    if (!String(companyId || '').trim()) return;
    if (!isCompanyStoragePath(pathOrUrl, bucket, companyId)) {
        // Las referencias externas o legadas fuera del negocio nunca se eliminan desde el cliente.
        return;
    }
    await deleteStorageObject(pathOrUrl, bucket);
}
