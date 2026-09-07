import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";

const CategoryModal = React.memo(({ isOpen, onClose, onSave, category, defaultOrder, saving = false }) => {
  const nameInputRef = useRef();
  const [isDirty, setIsDirty] = useState(false);
  /* El estado ocupado tiene que vivir aquí dentro: Admin.jsx monta este modal
     sin la prop `saving`, así que el botón "Guardar" se quedaba habilitado
     durante todo el viaje a la red. Cada clic extra reejecutaba
     admin_create_category_with_overrides y creaba una categoría duplicada.
     La prop se respeta igual, por si el padre sí la pasa. */
  const [submitting, setSubmitting] = useState(false);
  const busy = saving || submitting;

  const [formData, setFormData] = useState({
    name: '',
    order: 0,
    is_active: true
  });

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (category) {
          setFormData({
            name: category.name || '',
            order: category.order || 0,
            is_active: category.is_active !== undefined ? category.is_active : true
          });
        } else {
          setFormData({
            name: '',
            order: Number.isFinite(defaultOrder) ? defaultOrder : 0,
            is_active: true
          });
        }
        setIsDirty(false);
        if (nameInputRef.current) nameInputRef.current.focus();
      }, 0);
    }
  }, [isOpen, category, defaultOrder]);

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

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') handleSafeClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, handleSafeClose]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setIsDirty(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setSubmitting(true);
    try {
      await onSave(formData);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleSafeClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <header className="modal-header">
          <h3>{category ? 'Editar Categoría' : 'Nueva Categoría'}</h3>
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

        <form onSubmit={handleSubmit}>
          <div className="modal-form">
            <div className="form-group">
              <label>Nombre de la Categoría</label>
              <input
                ref={nameInputRef}
                className="form-input"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="Ej: Rolls Tradicionales"
              />
            </div>

            <div className="form-group">
              <label>Orden de visualización</label>
              <input
                className="form-input"
                type="number"
                name="order"
                value={formData.order}
                onChange={handleChange}
                min={1}
                required
              />
              <small className="category-hint">
                Menor número aparece primero (Ej: 1, 2, 3)
              </small>
            </div>

            <div className="category-active-section">
              <label className="text-sm fw-700" htmlFor="cat-active-switch">Categoría Activa</label>
              <label className="switch-slider-container">
                <input
                  id="cat-active-switch"
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  style={{ display: 'none' }}
                />
                <span className="switch-slider"></span>
              </label>
            </div>
          </div>

          <footer className="modal-footer" style={{ borderTop: '1px solid #22304a' }}>
            <Button variant="secondary" type="button" onClick={handleSafeClose} className="" disabled={busy}>Cancelar</Button>
            <Button variant="default" type="submit" className="" disabled={busy}>
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Save size={18} aria-hidden />}
              <span>{busy ? 'Guardando…' : 'Guardar'}</span>
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
});

CategoryModal.displayName = 'CategoryModal';

export default CategoryModal;
