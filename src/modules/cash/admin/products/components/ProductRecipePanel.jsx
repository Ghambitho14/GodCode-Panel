import React, { useMemo, useState } from 'react';
import { ChefHat, Plus, Search, X, Loader2 } from 'lucide-react';
import { getInputUnitOptions, getUnitLabel, normalizeUnit } from '@/lib/recipe-units';
import RecipePartPicker from '@/modules/cash/components/RecipePartPicker';

/**
 * Receta del producto dentro del modal de catálogo: mismas líneas que
 * Inventario → Recetas (artículo, cantidad, unidad, parte), para cargarla al
 * crear el producto en vez de ir después a otra pestaña.
 * Controlado: el modal guarda las líneas y las manda junto con el producto.
 */
export default function ProductRecipePanel({ lines, onChange, items, loading = false, loadError = null, error = null }) {
  const [filter, setFilter] = useState('');

  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items]);
  const usedIds = useMemo(() => new Set(lines.map((l) => String(l.inventory_item_id))), [lines]);

  const addable = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter((it) => {
      if (usedIds.has(String(it.id))) return false;
      if (!q) return true;
      return (it.name || '').toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q);
    });
  }, [items, usedIds, filter]);

  const addLine = (itemId) => {
    if (!itemId) return;
    const item = itemById.get(String(itemId));
    onChange([
      ...lines,
      { inventory_item_id: itemId, qty_per_sale: 1, input_unit: normalizeUnit(item?.unit || 'un'), part: '' },
    ]);
    setFilter('');
  };

  const updateLine = (index, field, value) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const removeLine = (index) => {
    onChange(lines.filter((_, i) => i !== index));
  };

  return (
    <section className="product-form__recipe" aria-labelledby="product-recipe-title">
      <header className="product-form__recipe-head">
        <span className="product-form__recipe-icon" aria-hidden><ChefHat size={16} strokeWidth={1.75} /></span>
        <div className="product-form__recipe-titles">
          <h4 id="product-recipe-title">Receta</h4>
          <p>Lo que se descuenta del inventario por cada unidad vendida.</p>
        </div>
        {lines.length > 0 ? <span className="product-form__recipe-count">{lines.length}</span> : null}
      </header>

      {loading ? (
        <p className="product-form__recipe-status">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Cargando receta…
        </p>
      ) : loadError ? (
        <p className="product-form__recipe-status product-form__recipe-status--error" role="alert">
          {loadError}
        </p>
      ) : (
        <>
          {lines.length === 0 ? (
            <p className="inventory-recipe-empty-hint product-form__recipe-empty">
              Sin artículos todavía. Añade lo que lleva el producto.
            </p>
          ) : (
            <ul className="inventory-recipe-lines product-form__recipe-lines">
              {lines.map((line, idx) => {
                const sel = itemById.get(String(line.inventory_item_id));
                const nativeUnit = normalizeUnit(sel?.unit || 'un');
                const unitOpts = getInputUnitOptions(nativeUnit);
                const name = sel?.name || 'Artículo que ya no existe';
                return (
                  <li key={`${line.inventory_item_id}-${idx}`} className="inventory-recipe-line">
                    <span className="inventory-recipe-line__item">
                      <span className="inventory-recipe-line__name">{name}</span>
                      <RecipePartPicker
                        value={line.part || ''}
                        itemName={sel?.name || 'el artículo'}
                        onChange={(value) => updateLine(idx, 'part', value)}
                      />
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      className="inventory-recipe-line__qty"
                      aria-label={`Cantidad de ${name} por venta`}
                      value={line.qty_per_sale}
                      onChange={(e) => updateLine(idx, 'qty_per_sale', e.target.value)}
                    />
                    {unitOpts.length > 1 ? (
                      <select
                        className="inventory-recipe-line__unit"
                        aria-label={`Unidad de ${name}`}
                        value={line.input_unit || nativeUnit}
                        onChange={(e) => updateLine(idx, 'input_unit', e.target.value)}
                      >
                        {unitOpts.map((u) => (
                          <option key={u} value={u}>{getUnitLabel(u, { short: true })}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="inventory-recipe-line__unit-static">{getUnitLabel(nativeUnit, { short: true })}</span>
                    )}
                    <button
                      type="button"
                      className="inventory-recipe-line__remove"
                      aria-label={`Quitar ${name} de la receta`}
                      onClick={() => removeLine(idx)}
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="inventory-recipe-add product-form__recipe-add">
            {items.length > 12 ? (
              <div className="search-box inventory-recipe-add__search">
                <Search size={16} aria-hidden />
                <input
                  type="search"
                  placeholder="Buscar artículo…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label="Buscar en la lista de artículos"
                />
              </div>
            ) : null}
            <span className="inventory-recipe-add__field">
              <Plus size={16} strokeWidth={2.25} aria-hidden />
              <select
                className="inventory-recipe-add__select"
                aria-label="Añadir un artículo a la receta"
                value=""
                disabled={addable.length === 0}
                onChange={(e) => addLine(e.target.value)}
              >
                <option value="">
                  {items.length === 0
                    ? 'No hay artículos en Inventario'
                    : addable.length === 0
                      ? 'No queda ningún artículo por añadir'
                      : 'Añadir un artículo…'}
                </option>
                {addable.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </span>
          </div>
          {items.length === 0 ? (
            <p className="product-form__recipe-hint">
              Crea los artículos en Inventario → Artículos para poder usarlos aquí.
            </p>
          ) : null}
        </>
      )}
      {error ? <span className="error-text">{error}</span> : null}
    </section>
  );
}
