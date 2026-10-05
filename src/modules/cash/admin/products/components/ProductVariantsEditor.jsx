import React, { useRef } from 'react';
import { Image as ImageIcon, Plus, Trash2, X } from 'lucide-react';

import { useSignedImageUrl } from '@/shared/hooks/useSignedImageUrl';
import {
  createVariantGroupDraft,
  createVariantOptionDraft,
  previewLineName,
  VARIANT_NAME_MAX,
} from '../services/productVariants';
import '../../../styles/ProductVariantsEditor.css';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function VariantOptionThumb({ option, disabled, onPick, onClear }) {
  const inputRef = useRef(null);
  const { url: signedUrl } = useSignedImageUrl(
    option.localFile ? '' : option.imageUrl || '',
    'menu',
    3600,
    true,
    0,
    'variantThumb',
  );
  const src = option.previewUrl || signedUrl || '';
  const hasImage = Boolean(src);

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert('La imagen es muy pesada (Máx 20MB)');
      return;
    }
    onPick(file);
  };

  return (
    <span className="pv-option__thumb-wrap">
      <button
        type="button"
        className={`pv-option__thumb${hasImage ? ' has-image' : ''}`}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title={hasImage ? 'Cambiar foto de la opción' : 'Foto propia de la opción (opcional)'}
        aria-label={hasImage ? 'Cambiar foto de la opción' : 'Agregar foto a la opción'}
      >
        {hasImage ? <img src={src} alt="" width={36} height={36} /> : <ImageIcon size={16} strokeWidth={1.75} aria-hidden />}
        {hasImage && !disabled ? (
          <span
            role="button"
            tabIndex={0}
            className="pv-option__thumb-clear"
            aria-label="Quitar foto de la opción"
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onClear();
              }
            }}
          >
            <X size={10} strokeWidth={3} aria-hidden />
          </span>
        ) : null}
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </span>
  );
}

/**
 * Editor de variantes de un producto. Controlado: recibe `groups` (borrador) y avisa
 * cada cambio con `onChange(nextGroups)`. `errors` es el mapa que devuelve
 * `validateVariantGroups`, por `key` de grupo u opción.
 */
export default function ProductVariantsEditor({
  groups,
  onChange,
  errors = {},
  currency = '',
  productName = '',
  disabled = false,
  status = null,
}) {
  const list = Array.isArray(groups) ? groups : [];

  const updateGroup = (groupKey, patch) => {
    onChange(list.map((group) => (group.key === groupKey ? { ...group, ...patch } : group)));
  };

  const updateOption = (groupKey, optionKey, patch) => {
    onChange(
      list.map((group) =>
        group.key === groupKey
          ? {
              ...group,
              options: group.options.map((option) => (option.key === optionKey ? { ...option, ...patch } : option)),
            }
          : group,
      ),
    );
  };

  const removeOption = (groupKey, optionKey) => {
    onChange(
      list.map((group) =>
        group.key === groupKey
          ? { ...group, options: group.options.filter((option) => option.key !== optionKey) }
          : group,
      ),
    );
  };

  const addOption = (groupKey) => {
    onChange(
      list.map((group) =>
        group.key === groupKey ? { ...group, options: [...group.options, createVariantOptionDraft()] } : group,
      ),
    );
  };

  const removeGroup = (groupKey) => {
    const group = list.find((entry) => entry.key === groupKey);
    const hasContent = group && group.options.some((option) => String(option.name ?? '').trim());
    if (hasContent && !window.confirm(`¿Quitar el grupo "${group.name || 'sin nombre'}" y sus opciones?`)) return;
    onChange(list.filter((entry) => entry.key !== groupKey));
  };

  return (
    <section className="pv" aria-label="Variantes del producto">
      <div className="pv__head">
        <div>
          <h4 className="pv__title">Variantes</h4>
          <p className="pv__hint">
            Opciones que cambian el producto principal (proteína, masa, tamaño de la porción…). El cliente elige una por
            grupo; la primera viene marcada. El precio del producto suma la diferencia de la opción elegida.
          </p>
        </div>
      </div>

      {status ? <p className={`pv__status${status.kind === 'error' ? ' pv__status--error' : ''}`}>{status.message}</p> : null}
      {errors.general ? <p className="error-text">{errors.general}</p> : null}

      {list.map((group) => {
        const groupError = errors[group.key];
        const firstOptionName = group.options.find((option) => String(option.name ?? '').trim())?.name;
        return (
          <div className="pv-group" key={group.key}>
            <div className="pv-group__head">
              <span className="pv-group__label">Grupo</span>
              <input
                className={`form-input pv-group__name${groupError ? ' error' : ''}`}
                value={group.name}
                maxLength={VARIANT_NAME_MAX}
                placeholder="Ej: Proteína"
                aria-label="Nombre del grupo"
                aria-invalid={Boolean(groupError)}
                disabled={disabled}
                onChange={(event) => updateGroup(group.key, { name: event.target.value })}
              />
              <button
                type="button"
                className="pv-group__remove"
                onClick={() => removeGroup(group.key)}
                disabled={disabled}
                aria-label="Quitar grupo"
                title="Quitar grupo"
              >
                <Trash2 size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            {groupError ? (
              <p className="error-text" style={{ padding: '6px 14px 0' }}>
                {groupError}
              </p>
            ) : null}

            <ul className="pv-options">
              {group.options.map((option) => {
                const optionError = errors[option.key];
                return (
                  <li className="pv-option" key={option.key}>
                    <VariantOptionThumb
                      option={option}
                      disabled={disabled}
                      onPick={(file) => {
                        if (option.previewUrl) URL.revokeObjectURL(option.previewUrl);
                        updateOption(group.key, option.key, { localFile: file, previewUrl: URL.createObjectURL(file) });
                      }}
                      onClear={() => {
                        if (option.previewUrl) URL.revokeObjectURL(option.previewUrl);
                        updateOption(group.key, option.key, { localFile: null, previewUrl: null, imageUrl: null });
                      }}
                    />
                    <input
                      className={`form-input pv-option__name${optionError ? ' error' : ''}`}
                      value={option.name}
                      maxLength={VARIANT_NAME_MAX}
                      placeholder="Ej: Pollo"
                      aria-label="Nombre de la opción"
                      aria-invalid={Boolean(optionError)}
                      disabled={disabled}
                      onChange={(event) => updateOption(group.key, option.key, { name: event.target.value })}
                    />
                    <div className="product-form__money pv-option__delta">
                      <span className="product-form__money-prefix" aria-hidden>
                        {currency ? `± ${currency}` : '±'}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="form-input"
                        value={option.priceDelta}
                        placeholder="0"
                        aria-label={`Diferencia de precio${currency ? ` en ${currency}` : ''} (0 = incluida)`}
                        disabled={disabled}
                        onChange={(event) => updateOption(group.key, option.key, { priceDelta: event.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="pv-option__remove"
                      onClick={() => removeOption(group.key, option.key)}
                      disabled={disabled}
                      aria-label="Quitar opción"
                      title="Quitar opción"
                    >
                      <X size={16} strokeWidth={1.75} aria-hidden />
                    </button>
                    {optionError ? <span className="error-text pv-option__error">{optionError}</span> : null}
                  </li>
                );
              })}
            </ul>

            <div className="pv-group__foot">
              <p className="pv-group__preview" title="Así se verá la línea en el menú y en la caja">
                {firstOptionName
                  ? `El cliente verá «${previewLineName(productName, [firstOptionName])}»`
                  : 'La primera opción queda marcada por defecto'}
              </p>
              <button type="button" className="pv-add" onClick={() => addOption(group.key)} disabled={disabled}>
                <Plus size={14} strokeWidth={2.25} aria-hidden />
                Agregar opción
              </button>
            </div>
          </div>
        );
      })}

      {list.length === 0 ? (
        <p className="pv-empty">
          Sin variantes: el producto se agrega al carrito tal cual. Ejemplo de grupo: «Proteína» con Carne, Pollo y
          Mixta (+1.50).
        </p>
      ) : null}

      <button
        type="button"
        className="pv-add pv-add--group"
        onClick={() => onChange([...list, createVariantGroupDraft()])}
        disabled={disabled}
      >
        <Plus size={14} strokeWidth={2.25} aria-hidden />
        {list.length === 0 ? 'Agregar grupo de variantes' : 'Agregar otro grupo'}
      </button>
    </section>
  );
}
