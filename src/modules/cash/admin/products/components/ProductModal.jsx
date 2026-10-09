import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Save, Image as ImageIcon, Loader2, Trash2, Star, Tag, Ruler } from 'lucide-react';
import '../../../styles/AdminMenuCarousel.css';
import { Button } from "@/components/ui/button";
import { useSignedImageUrl } from '@/shared/hooks/useSignedImageUrl';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import AdminMenuSelect from '@/modules/cash/components/AdminMenuSelect';
import ProductVariantsEditor from './ProductVariantsEditor';
import { listProductVariants, validateVariantGroups } from '../services/productVariants';
import { supabase, TABLES } from '@/integrations/supabase';
import { fetchAllPaginated, PANEL_PAGINATION_PAGE_SIZE } from '@/shared/utils/fetchAllPaginated';
import { INVENTORY_ITEMS_PANEL_SELECT, PRODUCT_INVENTORY_RECIPE_SELECT } from '@/modules/cash/services/inventorySelects';
import { normalizeUnit, toNativeQty } from '@/lib/recipe-units';
import ProductRecipePanel from './ProductRecipePanel';
import ProductSizesPanel from './ProductSizesPanel';
import { minSizeRowPrice, newSizeRow, validateSizeRows } from './productSizes';

const INITIAL_STATE = {
  name: '',
  price: '',
  description: '',
  category_id: '',
  dish_kind: '',
  is_special: false,
  has_discount: false,
  discount_price: '',
  image_url: '',
};

const ProductModal = React.memo(({ onClose, onSave, product, categories, companyId, branchId = null, saving = false }) => {
  const fileInputRef = useRef();
  const nameInputRef = useRef();
  /* El padre pasaba `saving={refreshing}`, la bandera global del panel, que
     también la enciende el botón "Actualizar" de la barra: un refresco ajeno
     congelaba este formulario. El envío se vigila desde aquí, que es lo único
     que sabe de verdad si este modal está guardando. La prop sigue existiendo
     por si otro padre quiere forzar el bloqueo. */
  const [submitting, setSubmitting] = useState(false);
  const busy = saving || submitting;
  // Moneda de la sucursal como prefijo del precio: "Precio ($)" era ambiguo
  // (peso chileno, argentino, dólar...). Aquí sale "CLP" / "USD" según el local.
  const { currency } = useBranchMoney();

  const [formData, setFormData] = useState(() => {
    if (product) {
      return {
        name: product.name || '',
        price: product.price || '',
        description: product.description || '',
        category_id: product.category_id || (categories?.[0]?.id || ''),
        dish_kind: product.dish_kind || '',
        is_special: product.is_special || false,
        has_discount: product.has_discount || false,
        discount_price: product.discount_price || '',
        image_url: product.image_url || '',
      };
    }
    return { ...INITIAL_STATE, category_id: categories?.[0]?.id || '' };
  });

  const [localFile, setLocalFile] = useState(null);
  const rawExistingUrl = formData.image_url || '';
  const { url: signedExistingUrl } = useSignedImageUrl(rawExistingUrl, 'menu', 3600, true, 0, 'modalPreview');
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!localFile) {
      setPreviewUrl(signedExistingUrl || '');
    }
  }, [localFile, signedExistingUrl]);

  const [isDragging, setIsDragging] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState({});

  /* Variantes (grupos de opción única que cambian el producto). Se cargan por
     producto y sucursal al editar; en un producto nuevo arrancan vacías y se guardan
     junto con él. Si la base aún no tiene la tabla, el editor se deshabilita y el
     guardado del producto sigue funcionando sin tocar variantes. */
  const [variantGroups, setVariantGroups] = useState([]);
  const [variantsBaseline, setVariantsBaseline] = useState([]);
  const [variantErrors, setVariantErrors] = useState({});
  const productId = product?.id || null;
  // Al editar, el estado arranca en "cargando": el efecto solo escribe cuando responde la base.
  const [variantStatus, setVariantStatus] = useState(() =>
    productId && branchId ? { kind: 'info', message: 'Cargando variantes…' } : null,
  );
  const [variantsEnabled, setVariantsEnabled] = useState(true);

  useEffect(() => {
    if (!productId || !branchId) return undefined;
    let cancelled = false;
    listProductVariants(productId, branchId)
      .then((groups) => {
        if (cancelled) return;
        setVariantGroups(groups);
        setVariantsBaseline(groups);
        setVariantsEnabled(true);
        setVariantStatus(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setVariantsEnabled(false);
        setVariantStatus({
          kind: 'error',
          message: `No se pudieron cargar las variantes (${error?.message || 'error'}). El producto se guarda igual, sin tocarlas.`,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [productId, branchId]);

  const handleVariantsChange = (next) => {
    setVariantGroups(next);
    setVariantErrors({});
    setIsDirty(true);
  };

  useEffect(() => {
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, []);

  /* Receta: los artículos son de la empresa (como en Inventario → Recetas).
     Solo se manda al guardar si se tocó, así un fallo de carga nunca borra
     la receta que ya tenía el producto. */
  const [inventoryItems, setInventoryItems] = useState([]);
  const [recipeLines, setRecipeLines] = useState([]);
  const [recipeLoading, setRecipeLoading] = useState(true);
  const [recipeLoadError, setRecipeLoadError] = useState(null);
  const [recipeDirty, setRecipeDirty] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setRecipeLoading(false);
      setRecipeLoadError('Sin empresa seleccionada: no se puede cargar la receta.');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [items, rows] = await Promise.all([
          fetchAllPaginated(
            supabase
              .from(TABLES.inventory_items)
              .select(INVENTORY_ITEMS_PANEL_SELECT)
              .eq('company_id', companyId)
              .order('name'),
            { pageSize: PANEL_PAGINATION_PAGE_SIZE },
          ),
          productId
            ? supabase
                .from(TABLES.product_inventory_recipe)
                .select(PRODUCT_INVENTORY_RECIPE_SELECT)
                .eq('company_id', companyId)
                .eq('product_id', productId)
                .then(({ data, error }) => {
                  if (error) throw error;
                  return data || [];
                })
            : Promise.resolve([]),
        ]);
        if (cancelled) return;
        const unitById = new Map(items.map((it) => [String(it.id), normalizeUnit(it.unit || 'un')]));
        setInventoryItems(items);
        setRecipeLines(
          rows.map((r) => ({
            inventory_item_id: r.inventory_item_id,
            qty_per_sale: Number(r.qty_per_sale) || 1,
            input_unit: unitById.get(String(r.inventory_item_id)) || 'un',
            part: r.part ?? '',
          })),
        );
      } catch (e) {
        console.warn('product recipe', e);
        if (!cancelled) {
          setRecipeLoadError('No se pudo cargar la receta. El producto se guardará sin tocarla.');
        }
      } finally {
        if (!cancelled) setRecipeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, productId]);

  /* Tamaños (Familiar, Mediana…): precio propio por sucursal en product_sizes. Igual que
     la receta, solo se mandan si se tocaron: un fallo de carga nunca los borra. */
  const [sizeRows, setSizeRows] = useState([]);
  const [sizesEnabled, setSizesEnabled] = useState(false);
  const [sizesLoading, setSizesLoading] = useState(Boolean(productId && branchId));
  const [sizesLoadError, setSizesLoadError] = useState(null);
  const [sizesDirty, setSizesDirty] = useState(false);

  useEffect(() => {
    if (!productId || !branchId || branchId === 'all') {
      setSizesLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from(TABLES.product_sizes)
          .select('id, name, price, sort_order')
          .eq('product_id', productId)
          .eq('branch_id', branchId)
          .order('sort_order');
        if (error) throw error;
        if (cancelled) return;
        const rows = (data || []).map((r) => ({ ...newSizeRow(r.name, r.price), id: r.id }));
        setSizeRows(rows);
        setSizesEnabled(rows.length > 0);
      } catch (e) {
        console.warn('product sizes', e);
        if (!cancelled) setSizesLoadError('No se pudieron cargar los tamaños. El producto se guardará sin tocarlos.');
      } finally {
        if (!cancelled) setSizesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, branchId]);

  const handleSizesChange = useCallback((next) => {
    setSizeRows(next);
    setSizesDirty(true);
    setIsDirty(true);
  }, []);

  const toggleSizes = useCallback(() => {
    const next = !sizesEnabled;
    if (next) {
      // Primera vez: una fila con el precio actual, para no empezar en blanco.
      if (sizeRows.length === 0) setSizeRows([newSizeRow('', formData.price || '')]);
      // Con tamaños la oferta no aplica: el precio de cada tamaño es el que se cobra.
      setFormData((prev) => ({ ...prev, has_discount: false }));
    }
    setSizesEnabled(next);
    setSizesDirty(true);
    setIsDirty(true);
  }, [sizesEnabled, sizeRows.length, formData.price]);

  const sizesActive = sizesEnabled && !sizesLoadError;
  const minSizePrice = sizesActive ? minSizeRowPrice(sizeRows) : null;

  const handleRecipeChange = useCallback((next) => {
    setRecipeLines(next);
    setRecipeDirty(true);
    setIsDirty(true);
  }, []);

  const inventoryUnitById = useMemo(
    () => new Map(inventoryItems.map((it) => [String(it.id), normalizeUnit(it.unit || 'un')])),
    [inventoryItems],
  );

  const handleSafeClose = useCallback(() => {
    if (busy) return;
    if (isDirty) {
      if (window.confirm('Tienes cambios sin guardar. ¿Seguro quieres cerrar?')) {
        onClose();
      }
    } else {
      onClose();
    }
  }, [isDirty, busy, onClose]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setIsDirty(true);
  };

  const processFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      if (file.size > 20 * 1024 * 1024) {
        alert('La imagen es muy pesada (Máx 20MB)');
        return;
      }
      setLocalFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setIsDirty(true);
    }
  };

  const handleFileChange = (e) => processFile(e.target.files[0]);

  const handleDragEvents = (e, dragging) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(dragging);
  };

  const handleDrop = (e) => {
    handleDragEvents(e, false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const clearImage = (e) => {
    e.stopPropagation();
    if (window.confirm('¿Eliminar la imagen actual?')) {
      setLocalFile(null);
      setPreviewUrl('');
      setFormData((prev) => ({ ...prev, image_url: '' }));
      setIsDirty(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Nombre requerido';
    if (sizesActive) {
      const sizesError = validateSizeRows(sizeRows);
      if (sizesError) newErrors.sizes = sizesError;
    } else if (!formData.price || Number(formData.price) <= 0) {
      newErrors.price = 'Precio inválido';
    }
    if (!formData.category_id) newErrors.category_id = 'Categoría requerida';

    if (formData.has_discount && !sizesActive) {
      if (!formData.discount_price || Number(formData.discount_price) <= 0) {
        newErrors.discount_price = 'Precio oferta inválido';
      } else if (Number(formData.discount_price) >= Number(formData.price)) {
        newErrors.discount_price = 'Debe ser menor al precio normal';
      }
    }

    if (recipeDirty && recipeLines.some((l) => !(Number(l.qty_per_sale) > 0))) {
      newErrors.recipe = 'Cada artículo de la receta necesita una cantidad mayor que 0';
    }

    const nextVariantErrors = variantsEnabled ? validateVariantGroups(variantGroups) : {};
    setVariantErrors(nextVariantErrors);
    if (Object.keys(nextVariantErrors).length > 0) newErrors.variants = 'Revisa las variantes';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!validate()) return;
    setSubmitting(true);
    const payload = { ...formData };
    if (sizesActive) {
      // El precio base queda en el tamaño más barato: es el "Desde" del menú y lo que
      // cobra una caja que todavía no elige tamaño.
      payload.price = minSizeRowPrice(sizeRows);
      payload.has_discount = false;
      payload.discount_price = '';
    }
    if (sizesDirty && !sizesLoadError && !sizesLoading) {
      payload.sizes = sizesEnabled
        ? sizeRows.map((r) => ({
            ...(r.id ? { id: r.id } : {}),
            name: String(r.name).trim(),
            price: Number(r.price),
          }))
        : [];
    }
    if (recipeDirty && !recipeLoadError) {
      // La receta se guarda en la unidad nativa del artículo, igual que en Inventario.
      payload.recipe = recipeLines.map((l) => {
        const native = inventoryUnitById.get(String(l.inventory_item_id)) || 'un';
        const qty = toNativeQty(Number(l.qty_per_sale), l.input_unit || native, native);
        return {
          inventory_item_id: l.inventory_item_id,
          qty_per_sale: Math.max(0.0001, qty || 0),
          part: String(l.part ?? '').trim() || null,
        };
      });
    }
    try {
      await onSave(
        {
          ...payload,
          variantsEnabled,
          variants: variantsEnabled ? variantGroups : null,
          variantsBaseline,
        },
        localFile,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions = (categories || []).map((cat) => ({ value: cat.id, label: cat.name }));
  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setIsDirty(true);
  };

  return (
    <div className="modal-overlay" onClick={handleSafeClose} role="dialog" aria-modal="true">
      <div className="modal-content product-modal-content" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h3 className="fw-700">{product ? 'Editar producto' : 'Nuevo producto'}</h3>
            <p className="modal-subtitle">
              {product
                ? 'Datos del catálogo y receta del producto.'
                : 'Agrega un producto al catálogo con su receta.'}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={handleSafeClose}
            className="btn-close"
            aria-label="Cerrar"
          >
            <X size={18} />
          </Button>
        </header>

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="modal-form-scroll">
            <div className="product-form animate-fade">
              <aside className="product-form__media">
                <div
                  className={`product-image-section ${isDragging ? 'dragging' : ''} ${errors.image ? 'error-border' : ''}`}
                  onDragOver={(e) => handleDragEvents(e, true)}
                  onDragLeave={(e) => handleDragEvents(e, false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                    style={{ display: 'none' }}
                  />

                  {previewUrl ? (
                    <div className="image-preview-container">
                      <img src={previewUrl} alt="Vista previa del producto" className="image-preview" width={400} height={400} />
                      <div className="image-overlay">
                        <Button variant="default" type="button" className="" onClick={clearImage} title="Quitar imagen">
                          <Trash2 size={18} />
                        </Button>
                        <span className="overlay-text">Click para cambiar</span>
                      </div>
                    </div>
                  ) : (
                    <div className="dropzone-placeholder">
                      <div className="icon-circle">
                        <ImageIcon size={26} strokeWidth={1.65} />
                      </div>
                      <p className="drop-text">
                        Arrastra una foto o <span>elige un archivo</span>
                      </p>
                    </div>
                  )}
                </div>
                {previewUrl ? (
                  <div className="product-form__media-actions">
                    <button type="button" className="product-form__media-btn" onClick={() => fileInputRef.current?.click()}>
                      Cambiar foto
                    </button>
                    <button type="button" className="product-form__media-btn product-form__media-btn--danger" onClick={clearImage}>
                      Quitar
                    </button>
                  </div>
                ) : null}
                <p className="product-form__media-hint">
                  JPG, PNG o WEBP · hasta 20 MB. Se ve en el menú público y en la caja.
                </p>
              </aside>

              <div className="product-form__fields">
                <div className="form-group">
                  <label htmlFor="product-name">
                    Nombre del producto <span className="req">*</span>
                  </label>
                  <input
                    id="product-name"
                    ref={nameInputRef}
                    className={`form-input ${errors.name ? 'error' : ''}`}
                    aria-invalid={Boolean(errors.name)}
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Ej: Margarita familiar"
                  />
                  {errors.name && <span className="error-text">{errors.name}</span>}
                </div>

                <div className="form-row two-col">
                  <div className="form-group">
                    <label htmlFor="product-price">
                      Precio <span className="req">*</span>
                    </label>
                    <div className={`product-form__money ${errors.price ? 'error' : ''}`}>
                      <span className="product-form__money-prefix" aria-hidden>{currency}</span>
                      <input
                        id="product-price"
                        type="number"
                        inputMode="decimal"
                        className="form-input"
                        aria-invalid={Boolean(errors.price)}
                        name="price"
                        value={sizesActive ? (minSizePrice ?? '') : formData.price}
                        onChange={handleChange}
                        placeholder="0"
                        min="0"
                        aria-label={`Precio en ${currency}`}
                        disabled={sizesActive}
                        title={sizesActive ? 'Con tamaños, el precio es el del tamaño más barato' : undefined}
                      />
                    </div>
                    {sizesActive ? (
                      <span className="product-form__field-hint">Desde: el tamaño más barato</span>
                    ) : null}
                    {errors.price && <span className="error-text">{errors.price}</span>}
                  </div>

                  <div className="form-group">
                    <label id="product-category-label">
                      Categoría <span className="req">*</span>
                    </label>
                    <AdminMenuSelect
                      className={`product-form__select ${errors.category_id ? 'error' : ''}`}
                      value={formData.category_id}
                      onChange={(next) => setField('category_id', next)}
                      options={categoryOptions}
                      displayLabel={formData.category_id ? undefined : 'Selecciona…'}
                      icon={<Tag size={16} strokeWidth={1.65} />}
                      aria-label="Categoría"
                      menuMinWidth={240}
                    />
                    {errors.category_id && <span className="error-text">{errors.category_id}</span>}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="product-description">Descripción</label>
                  <textarea
                    id="product-description"
                    className="form-input"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows="3"
                    placeholder="Ingredientes, tamaño, notas para el cliente…"
                  />
                </div>

                <div className="product-form__options" role="group" aria-label="Opciones del producto">
                  <div className={`product-form__option${formData.is_special ? ' is-on' : ''}`}>
                    <span className="product-form__option-icon" aria-hidden><Star size={16} strokeWidth={1.75} /></span>
                    <div className="switch-content">
                      <span className="switch-title">Destacar como especial</span>
                      <span className="switch-desc">Aparece con una estrella en el menú</span>
                    </div>
                    <Button variant="default"
                      type="button"
                      className={`menu-carousel-switch menu-carousel-switch--sm menu-carousel-switch--accent${formData.is_special ? ' is-on' : ''}`}
                      role="switch"
                      aria-checked={formData.is_special}
                      aria-label={formData.is_special ? 'Quitar destacado' : 'Destacar como especial'}
                      onClick={() => setField('is_special', !formData.is_special)}
                    >
                      <span className="menu-carousel-switch-knob" aria-hidden />
                    </Button>
                  </div>

                  <div className={`product-form__option${sizesActive ? ' is-on' : ''}`}>
                    <span className="product-form__option-icon" aria-hidden><Ruler size={16} strokeWidth={1.75} /></span>
                    <div className="switch-content">
                      <span className="switch-title">Varios tamaños</span>
                      <span className="switch-desc">
                        {sizesLoading
                          ? 'Cargando tamaños…'
                          : sizesLoadError
                            ? sizesLoadError
                            : 'Ej: pizza familiar, mediana y pequeña, cada una con su precio'}
                      </span>
                    </div>
                    <Button variant="default"
                      type="button"
                      className={`menu-carousel-switch menu-carousel-switch--sm${sizesActive ? ' is-on' : ''}`}
                      role="switch"
                      aria-checked={sizesActive}
                      aria-label={sizesActive ? 'Quitar tamaños' : 'Usar varios tamaños'}
                      onClick={toggleSizes}
                      disabled={sizesLoading || Boolean(sizesLoadError)}
                    >
                      <span className="menu-carousel-switch-knob" aria-hidden />
                    </Button>
                  </div>

                  {sizesActive && (
                    <ProductSizesPanel
                      rows={sizeRows}
                      onChange={handleSizesChange}
                      currency={currency}
                      error={errors.sizes}
                      disabled={busy}
                    />
                  )}

                  {/* Con tamaños la oferta no aplica: cada tamaño tiene su precio. */}
                  {!sizesActive && (
                    <div className={`product-form__option${formData.has_discount ? ' is-on' : ''}`}>
                      <span className="product-form__option-icon" aria-hidden><Tag size={16} strokeWidth={1.75} /></span>
                      <div className="switch-content">
                        <span className="switch-title">Precio de oferta</span>
                        <span className="switch-desc">El menú muestra el precio tachado y el rebajado</span>
                      </div>
                      <Button variant="default"
                        type="button"
                        className={`menu-carousel-switch menu-carousel-switch--sm${formData.has_discount ? ' is-on' : ''}`}
                        role="switch"
                        aria-checked={formData.has_discount}
                        aria-label={formData.has_discount ? 'Desactivar oferta' : 'Activar oferta'}
                        onClick={() => setField('has_discount', !formData.has_discount)}
                      >
                        <span className="menu-carousel-switch-knob" aria-hidden />
                      </Button>
                    </div>
                  )}

                  {!sizesActive && formData.has_discount && (
                    <div className="product-form__option-field animate-slide-down">
                      <label htmlFor="product-discount-price">
                        Precio con oferta <span className="req">*</span>
                      </label>
                      <div className={`product-form__money ${errors.discount_price ? 'error' : ''}`}>
                        <span className="product-form__money-prefix" aria-hidden>{currency}</span>
                        <input
                          id="product-discount-price"
                          type="number"
                          inputMode="decimal"
                          className="form-input"
                          aria-invalid={Boolean(errors.discount_price)}
                          name="discount_price"
                          value={formData.discount_price}
                          onChange={handleChange}
                          placeholder="Menor que el precio normal"
                          min="0"
                          aria-label={`Precio con oferta en ${currency}`}
                        />
                      </div>
                      {errors.discount_price && <span className="error-text">{errors.discount_price}</span>}
                    </div>
                  )}
                </div>

                <ProductVariantsEditor
                  groups={variantGroups}
                  onChange={handleVariantsChange}
                  errors={variantErrors}
                  currency={currency}
                  productName={formData.name}
                  disabled={busy || !variantsEnabled}
                  status={variantStatus}
                />
              </div>

              <ProductRecipePanel
                lines={recipeLines}
                onChange={handleRecipeChange}
                items={inventoryItems}
                loading={recipeLoading}
                loadError={recipeLoadError}
                error={errors.recipe}
              />
            </div>
          </div>

          <footer className="modal-footer">
            <Button variant="secondary" type="button" onClick={handleSafeClose} className="" disabled={busy}>
              Cancelar
            </Button>
            <Button variant="default" type="submit" className="" disabled={busy}>
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Save size={18} aria-hidden />}
              <span>{busy ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}</span>
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
});

ProductModal.displayName = 'ProductModal';

export default ProductModal;
