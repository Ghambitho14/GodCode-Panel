import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const uploadCompanyImage = vi.fn();
const deleteCompanyImage = vi.fn(async () => undefined);

vi.mock('@/integrations/supabase', () => ({
	supabase: { rpc: (...args) => rpc(...args) },
	TABLES: { product_variants: 'product_variants' },
}));

vi.mock('@/shared/utils/supabaseStorage', () => ({
	IMAGE_STORAGE_CONTEXTS: { PRODUCT_VARIANT: 'product-variant' },
	uploadCompanyImage: (...args) => uploadCompanyImage(...args),
	deleteCompanyImage: (...args) => deleteCompanyImage(...args),
}));

import {
	createVariantGroupDraft,
	createVariantOptionDraft,
	flattenVariantGroups,
	groupVariantRows,
	parseDelta,
	persistProductVariants,
	previewLineName,
	validateVariantGroups,
} from '@/modules/cash/admin/products/services/productVariants';

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const BRANCH = '99999999-9999-4999-8999-999999999999';
const COMPANY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function group(name, options) {
	return createVariantGroupDraft({
		name,
		options: options.map((option) => createVariantOptionDraft(option)),
	});
}

describe('groupVariantRows', () => {
	it('agrupa por nombre de grupo (sin distinguir mayúsculas) en el orden del panel', () => {
		const groups = groupVariantRows([
			{ id: 'b', group_name: 'Proteína', name: 'Pollo', price_delta: 0, sort_order: 1 },
			{ id: 'a', group_name: 'proteína', name: 'Carne', price_delta: '0', sort_order: 0, image_url: ' x/carne.png ' },
			{ id: 'c', group_name: 'Proteína', name: 'Mixta', price_delta: 1.5, sort_order: 2 },
			{ id: 'd', group_name: 'Punto', name: 'Medio', price_delta: null, sort_order: 3 },
			{ id: '', group_name: 'Punto', name: 'Sin id', sort_order: 4 },
		]);
		expect(groups.map((entry) => entry.name)).toEqual(['proteína', 'Punto']);
		expect(groups[0].options.map((option) => [option.id, option.name, option.priceDelta, option.imageUrl])).toEqual([
			['a', 'Carne', '', 'x/carne.png'],
			['b', 'Pollo', '', null],
			['c', 'Mixta', '1.5', null],
		]);
		expect(groups[1].options).toHaveLength(1);
	});
});

describe('validateVariantGroups (mismas reglas que la RPC)', () => {
	it('sin problemas devuelve un mapa vacío', () => {
		expect(validateVariantGroups([group('Proteína', [{ name: 'Carne' }, { name: 'Mixta', priceDelta: '1,5' }])])).toEqual({});
		expect(validateVariantGroups([])).toEqual({});
	});

	it('marca grupo sin nombre, grupo sin opciones y opción sin nombre', () => {
		const g1 = group('', [{ name: 'Carne' }]);
		const g2 = createVariantGroupDraft({ name: 'Punto', options: [] });
		const g3 = group('Masa', [{ name: '' }]);
		const errors = validateVariantGroups([g1, g2, g3]);
		expect(errors[g1.key]).toMatch(/nombre al grupo/);
		expect(errors[g2.key]).toMatch(/al menos una opción/);
		expect(errors[g3.options[0].key]).toMatch(/nombre de la opción/);
	});

	it('rechaza duplicados en el grupo, precios no numéricos y nombres largos', () => {
		const g = group('Proteína', [{ name: 'Pollo' }, { name: ' pollo ' }, { name: 'Mixta', priceDelta: 'abc' }, { name: 'x'.repeat(41) }]);
		const errors = validateVariantGroups([g]);
		expect(errors[g.options[1].key]).toMatch(/ya existe/);
		expect(errors[g.options[2].key]).toMatch(/número/);
		expect(errors[g.options[3].key]).toMatch(/Máximo 40/);
	});

	it('limita el total de opciones a 24', () => {
		const many = group('Grande', Array.from({ length: 25 }, (_, i) => ({ name: `Opción ${i}` })));
		expect(validateVariantGroups([many]).general).toMatch(/24 opciones/);
	});
});

describe('validateVariantGroups con el precio más bajo (tamaños o precio base)', () => {
	it('acepta rebajas que dejan el precio por encima de 0', () => {
		const proteina = group('Proteína', [{ name: 'Carne' }, { name: 'Vegetal', priceDelta: '-1000' }]);
		const masa = group('Masa', [{ name: 'Fina', priceDelta: '-500' }, { name: 'Gruesa', priceDelta: '800' }]);
		expect(validateVariantGroups([proteina, masa], { minPrice: 6000 })).toEqual({});
	});

	it('marca las rebajas que dejan el tamaño más barato en 0 o menos', () => {
		// Pizza Personal a 3.000 (el más barato): «Sin queso» −2.000 y «Masa fina» −1.000 la dejan en 0.
		const queso = group('Queso', [{ name: 'Con queso' }, { name: 'Sin queso', priceDelta: '-2000' }]);
		const masa = group('Masa', [{ name: 'Fina', priceDelta: '-1000' }, { name: 'Gruesa', priceDelta: '500' }]);
		const errors = validateVariantGroups([queso, masa], { minPrice: 3000 });
		expect(errors[queso.options[1].key]).toBe('Con esta rebaja el precio más bajo queda en 0 o menos');
		expect(errors[masa.options[0].key]).toBe('Con esta rebaja el precio más bajo queda en 0 o menos');
		expect(errors[masa.options[1].key]).toBeUndefined();
		// Con un tamaño más barato a 3.500 ya alcanza.
		expect(validateVariantGroups([queso, masa], { minPrice: 3500 })).toEqual({});
	});

	it('sin precio todavía no inventa errores de rebaja', () => {
		const g = group('Queso', [{ name: 'Sin queso', priceDelta: '-9000' }]);
		expect(validateVariantGroups([g], { minPrice: null })).toEqual({});
		expect(validateVariantGroups([g], { minPrice: 0 })).toEqual({});
		expect(validateVariantGroups([g])).toEqual({});
	});

	it('no tapa un error propio de la opción', () => {
		const g = group('Queso', [{ name: '', priceDelta: '-9000' }]);
		expect(validateVariantGroups([g], { minPrice: 5000 })[g.options[0].key]).toMatch(/nombre de la opción/);
	});
});

describe('flattenVariantGroups y parseDelta', () => {
	it('arma la lista plana en orden de pantalla con id, delta numérico y foto', () => {
		const g = group('Proteína', [
			{ id: 'a', name: ' Carne ', priceDelta: '', imageUrl: 'x/carne.png' },
			{ name: 'Mixta', priceDelta: '1,5' },
			{ name: '' },
		]);
		const uploads = new Map([[g.options[1].key, 'x/mixta.png']]);
		expect(flattenVariantGroups([g], uploads)).toEqual([
			{ id: 'a', group_name: 'Proteína', name: 'Carne', price_delta: 0, image_url: 'x/carne.png' },
			{ group_name: 'Proteína', name: 'Mixta', price_delta: 1.5, image_url: 'x/mixta.png' },
		]);
		expect(parseDelta('-2')).toBe(-2);
		expect(parseDelta('')).toBe(0);
		expect(Number.isNaN(parseDelta('1.2.3'))).toBe(true);
	});

	it('previsualiza el nombre de línea como lo compone la base', () => {
		expect(previewLineName('Hamburguesa', ['Pollo'])).toBe('Hamburguesa (Pollo)');
		expect(previewLineName('', ['Pollo'])).toBe('Producto (Pollo)');
		expect(previewLineName('Pizza', [])).toBe('Pizza');
	});
});

describe('persistProductVariants', () => {
	beforeEach(() => {
		rpc.mockReset();
		uploadCompanyImage.mockReset();
		deleteCompanyImage.mockClear();
	});

	it('sube fotos nuevas, llama a la RPC con la lista completa y borra las fotos que sobran', async () => {
		uploadCompanyImage.mockResolvedValue('c/catalog/variants/p/new.png');
		rpc.mockResolvedValue({
			data: [
				{ id: 'a', group_name: 'Proteína', name: 'Carne', price_delta: 0, image_url: null, sort_order: 0 },
				{ id: 'n', group_name: 'Proteína', name: 'Pollo', price_delta: 0, image_url: 'c/catalog/variants/p/new.png', sort_order: 1 },
			],
			error: null,
		});
		const file = { name: 'pollo.png', type: 'image/png', size: 10 };
		const groups = [group('Proteína', [{ id: 'a', name: 'Carne' }, { name: 'Pollo', localFile: file }])];
		const baseline = [group('Proteína', [{ id: 'a', name: 'Carne', imageUrl: 'c/catalog/variants/p/old.png' }, { id: 'z', name: 'Vieja', imageUrl: 'c/catalog/variants/p/vieja.png' }])];

		const result = await persistProductVariants({ productId: PRODUCT, branchId: BRANCH, companyId: COMPANY, groups, baseline, applyToAllBranches: true });

		expect(uploadCompanyImage).toHaveBeenCalledWith(file, 'product-variant', { companyId: COMPANY, entityId: PRODUCT });
		expect(rpc).toHaveBeenCalledWith('admin_set_product_variants', {
			p_product_id: PRODUCT,
			p_branch_id: BRANCH,
			p_variants: [
				{ id: 'a', group_name: 'Proteína', name: 'Carne', price_delta: 0 },
				{ group_name: 'Proteína', name: 'Pollo', price_delta: 0, image_url: 'c/catalog/variants/p/new.png' },
			],
			p_apply_to_all_branches: true,
		});
		const deleted = deleteCompanyImage.mock.calls.map((call) => call[0]).sort();
		expect(deleted).toEqual(['c/catalog/variants/p/old.png', 'c/catalog/variants/p/vieja.png']);
		expect(result[0].options.map((option) => option.name)).toEqual(['Carne', 'Pollo']);
	});

	it('si la RPC falla borra lo recién subido, no toca lo anterior y propaga el error', async () => {
		uploadCompanyImage.mockResolvedValue('c/catalog/variants/p/new.png');
		rpc.mockResolvedValue({ data: null, error: new Error('duplicate_variant_name') });
		const groups = [group('Proteína', [{ name: 'Pollo', localFile: { type: 'image/png' } }])];
		const baseline = [group('Proteína', [{ id: 'a', name: 'Carne', imageUrl: 'c/catalog/variants/p/old.png' }])];
		await expect(
			persistProductVariants({ productId: PRODUCT, branchId: BRANCH, companyId: COMPANY, groups, baseline }),
		).rejects.toThrow('duplicate_variant_name');
		expect(deleteCompanyImage).toHaveBeenCalledTimes(1);
		expect(deleteCompanyImage).toHaveBeenCalledWith('c/catalog/variants/p/new.png', 'product-variant', COMPANY);
	});
});
