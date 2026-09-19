import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Image as ImageIcon, Loader2, Trash2, Star, Tag } from 'lucide-react';
import '../../../styles/AdminMenuCarousel.css';
import { Button } from "@/components/ui/button";
import { useSignedImageUrl } from '@/shared/hooks/useSignedImageUrl';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import AdminMenuSelect from '@/modules/cash/components/AdminMenuSelect';

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

const ProductModal = React.memo(({ onClose, onSave, product, categories, saving = false }) => {
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

  useEffect(() => {
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, []);

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
    if (!formData.price || Number(formData.price) <= 0) newErrors.price = 'Precio inválido';
    if (!formData.category_id) newErrors.category_id = 'Categoría requerida';

    if (formData.has_discount) {
      if (!formData.discount_price || Number(formData.discount_price) <= 0) {
        newErrors.discount_price = 'Precio oferta inválido';
      } else if (Number(formData.discount_price) >= Number(formData.price)) {
        newErrors.discount_price = 'Debe ser menor al precio normal';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSave(formData, localFile);
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
                ? 'Datos comerciales del catálogo. El consumo de stock se configura en Inventario → Recetas / Consumo.'
                : 'Agrega un producto al catálogo. El stock se gestiona en Inventario.'}
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
                        value={formData.price}
                        onChange={handleChange}
                        placeholder="0"
                        min="0"
                        aria-label={`Precio en ${currency}`}
                      />
                    </div>
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

                  {formData.has_discount && (
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
              </div>
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
