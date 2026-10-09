import { describe, expect, it } from 'vitest';

import {
  MAX_PRODUCT_SIZES,
  applySizesToProductPayload,
  describeProductSizesSaveError,
  minSizeRowPrice,
  newSizeRow,
  productSizesSaveWarning,
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

describe('precio base y oferta con tamaños (lo que guarda useAdminCatalog)', () => {
  const form = { name: 'Pizza', price: '7000', has_discount: true, discount_price: '6500', category_id: 'c' };
  const rows = [
    { ...newSizeRow('Familiar', '12000'), id: 'size-fam' },
    newSizeRow(' Personal ', '6000'),
  ];

  it('con tamaños el precio base es el del más barato y la oferta se apaga', () => {
    const payload = applySizesToProductPayload(form, {
      sizesActive: true, sizesEnabled: true, sizesDirty: true, sizeRows: rows,
    });
    expect(payload).toMatchObject({ price: 6000, has_discount: false, discount_price: '' });
    expect(payload.sizes).toEqual([
      { id: 'size-fam', name: 'Familiar', price: 12000 },
      { name: 'Personal', price: 6000 },
    ]);
    expect(form).toMatchObject({ price: '7000', has_discount: true });
  });

  it('sin tocar los tamaños se recalcula el precio pero la lista no viaja', () => {
    const payload = applySizesToProductPayload(form, {
      sizesActive: true, sizesEnabled: true, sizesDirty: false, sizeRows: rows,
    });
    expect(payload.price).toBe(6000);
    expect(payload).not.toHaveProperty('sizes');
  });

  it('al apagar los tamaños se borran y vuelven el precio y la oferta del formulario', () => {
    const payload = applySizesToProductPayload(form, {
      sizesActive: false, sizesEnabled: false, sizesDirty: true, sizeRows: rows,
    });
    expect(payload).toMatchObject({ price: '7000', has_discount: true, discount_price: '6500', sizes: [] });
  });

  it('si los tamaños no cargaron o siguen cargando, nunca se mandan (no se borran)', () => {
    const failed = applySizesToProductPayload(form, {
      sizesActive: false, sizesEnabled: true, sizesDirty: true, sizesLoadError: 'No se pudieron cargar', sizeRows: rows,
    });
    expect(failed).not.toHaveProperty('sizes');
    expect(failed.price).toBe('7000');
    const loading = applySizesToProductPayload(form, {
      sizesActive: true, sizesEnabled: true, sizesDirty: true, sizesLoading: true, sizeRows: rows,
    });
    expect(loading).not.toHaveProperty('sizes');
  });
});

describe('errores de admin_set_product_sizes', () => {
  const cases = [
    [{ code: '22000', message: 'duplicate_size_name' }, 'Hay dos tamaños con el mismo nombre'],
    [{ code: '22000', message: 'invalid_size_name' }, 'Un tamaño no tiene nombre'],
    [{ code: '22000', message: 'invalid_size_price' }, 'El precio de un tamaño no es válido'],
    [{ code: '22000', message: 'too_many_sizes' }, 'Son demasiados tamaños'],
    [{ code: '42501', message: 'branch_not_allowed' }, 'No puedes editar tamaños en esta sucursal'],
    [{ code: '42501', message: 'not_allowed' }, 'No tienes permiso para editar tamaños'],
    [{ code: '42501', message: 'permission denied for function admin_set_product_sizes' }, 'No tienes permiso para editar tamaños'],
    [
      {
        code: 'PGRST202',
        message: 'Could not find the function public.admin_set_product_sizes(p_apply_to_all_branches, p_branch_id, p_product_id, p_sizes) in the schema cache',
        hint: null,
      },
      'La base todavía no tiene la función de tamaños; avisa al equipo de Gcode',
    ],
    [{ message: 'Could not find the function public.admin_set_product_sizes without code' }, 'La base todavía no tiene la función de tamaños; avisa al equipo de Gcode'],
    [{ code: '42883', message: 'function public.admin_set_product_sizes(uuid, uuid, jsonb, boolean) does not exist' }, 'La base todavía no tiene la función de tamaños; avisa al equipo de Gcode'],
    [{ code: '22000', message: 'product_not_found' }, 'No se pudieron guardar los tamaños'],
    [{ message: 'Failed to fetch' }, 'No se pudieron guardar los tamaños'],
    [null, 'No se pudieron guardar los tamaños'],
  ];

  it.each(cases)('%j se dice como «%s»', (error, expected) => {
    expect(describeProductSizesSaveError(error)).toBe(expected);
  });

  it('el aviso nunca muestra el texto crudo y va en minúscula tras los dos puntos', () => {
    expect(productSizesSaveWarning({ code: '22000', message: 'duplicate_size_name' }))
      .toBe('los tamaños no se guardaron: hay dos tamaños con el mismo nombre');
    const missing = productSizesSaveWarning({ code: 'PGRST202', message: 'Could not find the function public.admin_set_product_sizes' });
    expect(missing).toBe('los tamaños no se guardaron: la base todavía no tiene la función de tamaños; avisa al equipo de Gcode');
    expect(missing).not.toMatch(/could not find|PGRST|admin_set/i);
  });
});
