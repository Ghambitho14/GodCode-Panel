import { describe, expect, it } from 'vitest';

import { toSafeHttpUrl } from '@/shared/utils/safeUrl';

describe('toSafeHttpUrl', () => {
	it('acepta https y devuelve la forma normalizada', () => {
		const url = 'https://www.google.com/maps/dir/?api=1&destination=-33.4,-70.6';
		expect(toSafeHttpUrl(url)).toBe(url);
	});

	it('acepta http', () => {
		expect(toSafeHttpUrl('http://example.com/a')).toBe('http://example.com/a');
	});

	it('recorta los espacios sobrantes', () => {
		expect(toSafeHttpUrl('  https://example.com/  ')).toBe('https://example.com/');
	});

	it('rechaza javascript:', () => {
		// El bug original: esto llegaba a un href en la sesión del cajero.
		expect(toSafeHttpUrl('javascript:alert(document.cookie)')).toBeNull();
	});

	it('rechaza javascript: con mayúsculas mezcladas', () => {
		expect(toSafeHttpUrl('JaVaScRiPt:alert(1)')).toBeNull();
	});

	it('rechaza javascript: precedido de espacios de control', () => {
		expect(toSafeHttpUrl('javascript:alert(1)')).toBeNull();
		expect(toSafeHttpUrl('\n\tjavascript:alert(1)')).toBeNull();
	});

	it('rechaza data:, vbscript:, blob: y file:', () => {
		expect(toSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
		expect(toSafeHttpUrl('vbscript:msgbox(1)')).toBeNull();
		expect(toSafeHttpUrl('blob:https://example.com/abc')).toBeNull();
		expect(toSafeHttpUrl('file:///etc/passwd')).toBeNull();
	});

	it('rechaza rutas relativas y protocol-relative', () => {
		// Se parsea sin base a propósito: el valor no es nuestro, no debe
		// resolverse contra el origen del panel.
		expect(toSafeHttpUrl('/ruta/interna')).toBeNull();
		expect(toSafeHttpUrl('//evil.com/x')).toBeNull();
		expect(toSafeHttpUrl('example.com/sin-esquema')).toBeNull();
	});

	it('rechaza valores vacíos o que no son cadenas', () => {
		expect(toSafeHttpUrl('')).toBeNull();
		expect(toSafeHttpUrl('   ')).toBeNull();
		expect(toSafeHttpUrl(null)).toBeNull();
		expect(toSafeHttpUrl(undefined)).toBeNull();
		expect(toSafeHttpUrl(42)).toBeNull();
		expect(toSafeHttpUrl({ href: 'https://example.com' })).toBeNull();
	});
});
