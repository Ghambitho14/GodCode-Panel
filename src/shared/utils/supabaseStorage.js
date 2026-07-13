import { supabase } from '@/integrations/supabase/client';

const MAX_SIZE_MB = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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

    if (!['menu', 'receipts', 'products'].includes(bucket)) {
        throw new Error(`Bucket "${bucket}" no válido.`);
    }

    const ext = getFileExtension(file);
    const fileName = folder
        ? `${folder}/${crypto.randomUUID()}.${ext}`
        : `${crypto.randomUUID()}.${ext}`;

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
 * Devuelve una URL firmada para un archivo privado de Supabase Storage.
 * Si el valor ya es una URL completa (http/https), la devuelve tal cual.
 *
 * @param {string | null | undefined} pathOrUrl - Ruta relativa del archivo o URL completa.
 * @param {'menu' | 'receipts' | 'products'} bucket - Bucket.
 * @param {number} [expiresIn=3600] - Segundos de validez de la URL firmada.
 * @returns {Promise<string | null>} URL firmada o URL completa original.
 */
export async function getSignedImageUrl(pathOrUrl, bucket, expiresIn = 3600) {
    if (!pathOrUrl) return null;
    const trimmed = String(pathOrUrl).trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(trimmed, expiresIn);

    if (error) {
        throw new Error(error.message || 'Error al generar URL firmada');
    }

    return data.signedUrl;
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
    if (!/^https?:\/\//i.test(trimmed)) return trimmed;
    const marker = `/object/public/${bucket}/`;
    const idx = trimmed.indexOf(marker);
    if (idx === -1) return trimmed;
    return trimmed.slice(idx + marker.length);
}
