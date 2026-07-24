import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
	getSignedImageUrl: vi.fn(),
	isSupabaseStorageUrl: vi.fn(() => true),
	extractStoragePath: vi.fn((value, bucket) => String(value).startsWith(`${bucket}/`)
		? String(value).slice(bucket.length + 1)
		: value),
}));

vi.mock('@/shared/utils/supabaseStorage', () => storageMocks);

import { useSignedImageUrl } from '@/shared/hooks/useSignedImageUrl';

function ImageUrlProbe({ path, enabled = true, testId = 'url' }) {
	const state = useSignedImageUrl(path, 'menu', 3600, enabled);
	return <output data-testid={testId} data-loading={String(state.loading)}>{state.url || state.error || ''}</output>;
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('useSignedImageUrl', () => {
	it('no solicita una URL firmada hasta que la imagen está habilitada', async () => {
		storageMocks.getSignedImageUrl.mockResolvedValue('https://storage.test/lazy-signed');
		const { rerender } = render(<ImageUrlProbe path="company/product-lazy.webp" enabled={false} />);

		expect(storageMocks.getSignedImageUrl).not.toHaveBeenCalled();
		rerender(<ImageUrlProbe path="company/product-lazy.webp" enabled />);

		await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('lazy-signed'));
		expect(storageMocks.getSignedImageUrl).toHaveBeenCalledTimes(1);
	});

	it('reutiliza la URL firmada al volver a montar la misma imagen', async () => {
		storageMocks.getSignedImageUrl.mockResolvedValue('https://storage.test/cached-signed');
		const firstRender = render(<ImageUrlProbe path="company/product-cached.webp" />);
		await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('cached-signed'));
		firstRender.unmount();

		render(<ImageUrlProbe path="company/product-cached.webp" />);
		await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('cached-signed'));
		expect(storageMocks.getSignedImageUrl).toHaveBeenCalledTimes(1);
	});

	it('comparte una solicitud en curso entre imágenes con la misma ruta', async () => {
		let resolveRequest;
		storageMocks.getSignedImageUrl.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
		render(
			<>
				<ImageUrlProbe path="company/product-shared.webp" testId="first-url" />
				<ImageUrlProbe path="company/product-shared.webp" testId="second-url" />
			</>,
		);

		expect(storageMocks.getSignedImageUrl).toHaveBeenCalledTimes(1);
		resolveRequest('https://storage.test/shared-signed');
		await waitFor(() => {
			expect(screen.getByTestId('first-url')).toHaveTextContent('shared-signed');
			expect(screen.getByTestId('second-url')).toHaveTextContent('shared-signed');
		});
	});
});
