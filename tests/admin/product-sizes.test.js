import { describe, expect, it } from 'vitest';

import {
  MAX_PRODUCT_SIZES,
  minSizeRowPrice,
  newSizeRow,
  validateSizeRows,
} from '@/modules/cash/admin/products/components/productSizes';

describe('tamaños de producto (editor del modal)', () => {
  it('cada fila nueva tiene una clave propia y sin id', () => {
    const a = newSizeRow('Familiar', 15000);
    const b = newSizeRow();
    expect(a.key).not.toBe(b.key);
    expect(a).toMatchObject({ id: null, name: 'Familiar', price: '15000' });
  });

  it('el precio base es el del tamaño más barato con precio válido', () => {
    expect(minSizeRowPrice([newSizeRow('A', '9000'), newSizeRow('B', '6500'), newSizeRow('C', '')])).toBe(6500);
    expect(minSizeRowPrice([newSizeRow('A', '')])).toBeNull();
  });

  it('valida lista vacía, nombres vacíos o repetidos y precios', () => {
    expect(validateSizeRows([])).toMatch(/al menos un tamaño/);
    expect(validateSizeRows([newSizeRow('', '10')])).toMatch(/nombre/);
    expect(validateSizeRows([newSizeRow('Familiar', '10'), newSizeRow(' familiar ', '12')])).toMatch(/repetido/);
    expect(validateSizeRows([newSizeRow('Familiar', '0')])).toMatch(/precio/);
    expect(validateSizeRows(Array.from({ length: MAX_PRODUCT_SIZES + 1 }, (_, i) => newSizeRow(`T${i}`, 1)))).toMatch(/Máximo/);
    expect(validateSizeRows([newSizeRow('Familiar', '15000'), newSizeRow('Pequeña', '8000')])).toBeNull();
  });
});
