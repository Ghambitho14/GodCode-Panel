import React, { useEffect, useId } from 'react';
import { useHistoryBack } from '@/modules/cash/hooks/useHistoryBack';
import { X, Globe, MapPin, AlertTriangle } from 'lucide-react';
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';
import '../styles/ScopeSelectionModal.css';

/**
 * Al activar o desactivar un producto: ¿solo en esta sucursal o en todas?
 * Esc y clic fuera cierran sin aplicar nada.
 */
const ScopeSelectionModal = ({ isOpen, onClose, onConfirm, branchName, actionType = 'change' }) => {
  const titleId = useId();
  useLockBodyScroll(Boolean(isOpen));
  useHistoryBack(Boolean(isOpen), onClose);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const verb = actionType === 'activate' ? 'activar' : 'desactivar';
  const canPickLocal = branchName !== 'Todas las sucursales';

  return (
    <div className="modal-overlay scope-modal__overlay" onClick={onClose}>
      <div
        className="modal-content glass animate-scale-in scope-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="fw-700">Confirmar cambio</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar">
            <X size={22} aria-hidden />
          </button>
        </div>

        <div className="modal-body scope-modal__body">
          <div className="scope-modal__intro">
            <span className="scope-modal__badge" aria-hidden>
              <AlertTriangle size={26} strokeWidth={1.75} />
            </span>
            <h4 id={titleId} className="scope-modal__question">¿Dónde quieres aplicar este cambio?</h4>
            <p className="scope-modal__hint">
              Estás a punto de <strong>{verb}</strong> un elemento.
            </p>
          </div>

          <div className="scope-modal__options">
            {canPickLocal && (
              <button type="button" className="scope-option" onClick={() => onConfirm('local')} autoFocus>
                <span className="scope-option__icon scope-option__icon--local" aria-hidden>
                  <MapPin size={20} />
                </span>
                <span className="scope-option__text">
                  <span className="scope-option__title">Solo en {branchName}</span>
                  <span className="scope-option__desc">No afectará a otros locales</span>
                </span>
              </button>
            )}
            <button type="button" className="scope-option" onClick={() => onConfirm('global')} autoFocus={!canPickLocal}>
              <span className="scope-option__icon scope-option__icon--global" aria-hidden>
                <Globe size={20} />
              </span>
              <span className="scope-option__text">
                <span className="scope-option__title">En todos los locales</span>
                <span className="scope-option__desc">Se aplicará a toda la cadena</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScopeSelectionModal;
