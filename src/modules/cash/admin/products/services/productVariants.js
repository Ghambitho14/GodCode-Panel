import { supabase, TABLES } from '@/integrations/supabase';
import {
  deleteCompanyImage,
  IMAGE_STORAGE_CONTEXTS,
  uploadCompanyImage,
} from '@/shared/utils/supabaseStorage';

/**
 * Variantes de producto: grupos de opción única que cambian el producto principal
 * ("Proteína: carne / pollo / mixta"). Viven en `product_variants`, por sucursal, y
 * las guarda completas `admin_set_product_variants` (igual que los tamaños). La
 * variante no reemplaza el precio: SUMA `price_delta` (0, positivo o negativo) al
 * precio del producto. La primera opción de cada grupo es la que el menú marca por
 * defecto. Las reglas de validación de aquí son las mismas que aplica la RPC, para
 * que el error salga en el formulario y no como un fallo de la base.
 */

export const VARIANT_NAME_MAX = 40;
export const VARIANT_OPTIONS_MAX = 24;
export const VARIANT_DELTA_MAX = 999999;

function createKey(prefix) {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${random}`;
}

export function createVariantOptionDraft(overrides = {}) {
  return {
    key: createKey('opt'),
    id: null,
    name: '',
    priceDelta: '',
    imageUrl: null,
    localFile: null,
    previewUrl: null,
    ...overrides,
  };
}

export function createVariantGroupDraft(overrides = {}) {
  return {
    key: createKey('grp'),
    name: '',
    options: [createVariantOptionDraft()],
    ...overrides,
  };
}

/** Texto del campo de precio a número; '' y '+' cuentan como 0. */
export function parseDelta(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (raw === '' || raw === '+' || raw === '-') return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Filas de `product_variants` (una por opción) → grupos en el orden del panel, con
 * el formato que usa el editor.
 */
export function groupVariantRows(rows) {
  const sorted = [...(Array.isArray(rows) ? rows : [])].sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
  );
  const groups = [];
  for (const row of sorted) {
    const groupName = String(row.group_name ?? '').trim();
    const name = String(row.name ?? '').trim();
    if (!row.id || !groupName || !name) continue;
    let group = groups.find((entry) => entry.name.toLowerCase() === groupName.toLowerCase());
    if (!group) {
      group = createVariantGroupDraft({ name: groupName, options: [] });
      groups.push(group);
    }
    const delta = Number(row.price_delta);
    group.options.push(
      createVariantOptionDraft({
        id: String(row.id),
        name,
        priceDelta: Number.isFinite(delta) && delta !== 0 ? String(delta) : '',
        imageUrl: typeof row.image_url === 'string' && row.image_url.trim() ? row.image_url.trim() : null,
      }),
    );
  }
  return groups;
}

export async function listProductVariants(productId, branchId) {
  if (!productId || !branchId) return [];
  const { data, error } = await supabase
    .from(TABLES.product_variants)
    .select('id, group_name, name, price_delta, image_url, sort_order, is_active')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return groupVariantRows(data ?? []);
}

/**
 * Mismas reglas que `admin_set_product_variants`. Devuelve un mapa de errores por
 * `key` (grupo u opción) más `general`; sin errores, el objeto queda vacío.
 *
 * Con `minPrice` (el precio base o, con tamaños, el del tamaño más barato) suma la regla
 * de la venta: la variante se suma a ese precio y la base rechaza la línea que quede en
 * 0 o menos, así que la opción más barata de cada grupo tiene que dejarlo por encima de 0.
 */
export function validateVariantGroups(groups, { minPrice = null } = {}) {
  const errors = {};
  const list = Array.isArray(groups) ? groups : [];
  const seen = new Set();
  let total = 0;
  for (const group of list) {
    const groupName = String(group.name ?? '').trim();
    if (!groupName) errors[group.key] = 'Ponle nombre al grupo (ej: Proteína)';
    else if (groupName.length > VARIANT_NAME_MAX) errors[group.key] = `Máximo ${VARIANT_NAME_MAX} caracteres`;
    if (!group.options || group.options.length === 0) {
      errors[group.key] = errors[group.key] || 'Agrega al menos una opción';
      continue;
    }
    for (const option of group.options) {
      total += 1;
      const name = String(option.name ?? '').trim();
      const delta = parseDelta(option.priceDelta);
      if (!name) {
        errors[option.key] = 'Escribe el nombre de la opción';
      } else if (name.length > VARIANT_NAME_MAX) {
        errors[option.key] = `Máximo ${VARIANT_NAME_MAX} caracteres`;
      } else if (Number.isNaN(delta)) {
        errors[option.key] = 'La diferencia de precio debe ser un número';
      } else if (Math.abs(delta) > VARIANT_DELTA_MAX) {
        errors[option.key] = 'La diferencia de precio es demasiado grande';
      } else {
        const dupKey = `${groupName.toLowerCase()}|${name.toLowerCase()}`;
        if (seen.has(dupKey)) errors[option.key] = 'Esta opción ya existe en el grupo';
        seen.add(dupKey);
      }
    }
  }
  if (total > VARIANT_OPTIONS_MAX) {
    errors.general = `Como máximo ${VARIANT_OPTIONS_MAX} opciones entre todos los grupos`;
  }

  const floor = Number(minPrice);
  if (minPrice != null && minPrice !== '' && Number.isFinite(floor) && floor > 0) {
    let lowest = floor;
    const discounted = [];
    for (const group of list) {
      let cheapest = null;
      for (const option of group.options ?? []) {
        const delta = parseDelta(option.priceDelta);
        if (!Number.isFinite(delta)) continue;
        if (cheapest == null || delta < cheapest.delta) cheapest = { key: option.key, delta };
      }
      if (!cheapest) continue;
      lowest += cheapest.delta;
      if (cheapest.delta < 0) discounted.push(cheapest.key);
    }
    if (lowest <= 0) {
      for (const key of discounted) {
        errors[key] = errors[key] || 'Con esta rebaja el precio más bajo queda en 0 o menos';
      }
    }
  }
  return errors;
}

/** Grupos del editor → lista plana en el orden de pantalla, como la espera la RPC. */
export function flattenVariantGroups(groups, imagePathByKey = new Map()) {
  const payload = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    const groupName = String(group.name ?? '').trim();
    for (const option of group.options ?? []) {
      const name = String(option.name ?? '').trim();
      if (!groupName || !name) continue;
      const delta = parseDelta(option.priceDelta);
      const imageUrl = imagePathByKey.has(option.key) ? imagePathByKey.get(option.key) : option.imageUrl;
      payload.push({
        ...(option.id ? { id: option.id } : {}),
        group_name: groupName,
        name,
        price_delta: Number.isFinite(delta) ? delta : 0,
        ...(imageUrl ? { image_url: imageUrl } : {}),
      });
    }
  }
  return payload;
}

export async function saveProductVariants({ productId, branchId, variants, applyToAllBranches = false }) {
  const { data, error } = await supabase.rpc('admin_set_product_variants', {
    p_product_id: productId,
    p_branch_id: branchId,
    p_variants: variants,
    p_apply_to_all_branches: Boolean(applyToAllBranches),
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function collectImagePaths(groups) {
  const paths = new Set();
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const option of group.options ?? []) {
      if (option.imageUrl) paths.add(option.imageUrl);
    }
  }
  return paths;
}

/**
 * Guarda los grupos del editor: sube las fotos nuevas, llama a la RPC con la lista
 * completa y, solo si la base aceptó, borra las fotos que ya no se usan. Si la RPC
 * falla se borran las fotos recién subidas para no dejar huérfanos.
 */
export async function persistProductVariants({
  productId,
  branchId,
  companyId,
  groups,
  baseline = [],
  applyToAllBranches = false,
}) {
  const uploaded = new Map();
  const uploadedPaths = [];
  try {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const option of group.options ?? []) {
        if (!option.localFile) continue;
        const path = await uploadCompanyImage(option.localFile, IMAGE_STORAGE_CONTEXTS.PRODUCT_VARIANT, {
          companyId,
          entityId: productId,
        });
        uploaded.set(option.key, path);
        uploadedPaths.push(path);
      }
    }
    const variants = flattenVariantGroups(groups, uploaded);
    const rows = await saveProductVariants({ productId, branchId, variants, applyToAllBranches });

    // Fotos que estaban y ya no están en lo guardado (opción borrada o foto cambiada).
    const kept = new Set(rows.map((row) => row.image_url).filter(Boolean));
    for (const path of collectImagePaths(baseline)) {
      if (!kept.has(path)) {
        await deleteCompanyImage(path, IMAGE_STORAGE_CONTEXTS.PRODUCT_VARIANT, companyId);
      }
    }
    return groupVariantRows(rows);
  } catch (error) {
    for (const path of uploadedPaths) {
      await deleteCompanyImage(path, IMAGE_STORAGE_CONTEXTS.PRODUCT_VARIANT, companyId);
    }
    throw error;
  }
}

/** Nombre de línea que verá el cliente en el menú y la caja: "Pizza (Pollo)". */
export function previewLineName(productName, optionNames) {
  const base = String(productName ?? '').trim() || 'Producto';
  const parts = (optionNames ?? []).map((name) => String(name ?? '').trim()).filter(Boolean);
  return parts.length > 0 ? `${base} (${parts.join(', ')})` : base;
}
