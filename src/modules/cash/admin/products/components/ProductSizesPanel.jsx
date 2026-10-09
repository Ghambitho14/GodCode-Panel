import React from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_PRODUCT_SIZES, newSizeRow } from './productSizes';


/**
 * Tamaños del producto ("Familiar", "Mediana"…) con su precio en la sucursal elegida.
 * Controlado: el modal guarda las filas y las manda al guardar el producto.
 */
export default function ProductSizesPanel({ rows, onChange, currency, error = null, disabled = false }) {
  const update = (index, field, value) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="product-form__option-field product-form__sizes animate-slide-down">
      <ul className="product-form__sizes-list">
        {rows.map((row, index) => (
          <li key={row.key} className="product-form__size-row">
            <input
              className="form-input product-form__size-name"
              value={row.name}
              onChange={(e) => update(index, 'name', e.target.value)}
              placeholder={index === 0 ? 'Ej: Familiar' : 'Ej: Mediana'}
              maxLength={40}
              aria-label={`Nombre del tamaño ${index + 1}`}
              disabled={disabled}
            />
            <div className="product-form__money product-form__size-price">
              <span className="product-form__money-prefix" aria-hidden>{currency}</span>
              <input
                type="number"
                inputMode="decimal"
                className="form-input"
                value={row.price}
                onChange={(e) => update(index, 'price', e.target.value)}
                placeholder="0"
                min="0"
                aria-label={`Precio del tamaño ${index + 1} en ${currency}`}
                disabled={disabled}
              />
            </div>
            <div className="product-form__size-actions">
              <button
                type="button"
                className="product-form__size-btn"
                onClick={() => move(index, -1)}
                disabled={disabled || index === 0}
                aria-label="Subir tamaño"
                title="Subir"
              >
                <ArrowUp size={14} aria-hidden />
              </button>
              <button
                type="button"
                className="product-form__size-btn"
                onClick={() => move(index, 1)}
                disabled={disabled || index === rows.length - 1}
                aria-label="Bajar tamaño"
                title="Bajar"
              >
                <ArrowDown size={14} aria-hidden />
              </button>
              <button
                type="button"
                className="product-form__size-btn product-form__size-btn--danger"
                onClick={() => remove(index)}
                disabled={disabled}
                aria-label={`Quitar tamaño ${row.name || index + 1}`}
                title="Quitar"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {rows.length < MAX_PRODUCT_SIZES ? (
        <Button
          type="button"
          variant="secondary"
          className="product-form__size-add"
          onClick={() => onChange([...rows, newSizeRow()])}
          disabled={disabled}
        >
          <Plus size={16} aria-hidden /> Agregar tamaño
        </Button>
      ) : null}
      <p className="product-form__sizes-hint">
        El menú muestra «Desde» con el más barato y el cliente elige al agregar. El orden de la lista es el del menú.
        Los tamaños son de esta sucursal.
      </p>
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}
