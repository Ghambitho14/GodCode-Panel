export const TARGET_RATIO = 2.35;
export const OUTPUT_WIDTH = 1920;
export const OUTPUT_HEIGHT = 817;

const EXPORT_QUALITY = 0.92;

/**
 * @param {File} file
 * @returns {Promise<{ width: number, height: number }>}
 */
export function readImageDimensions(file) {
	return new Promise((resolve, reject) => {
		const objectUrl = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			const dims = { width: img.naturalWidth, height: img.naturalHeight };
			URL.revokeObjectURL(objectUrl);
			resolve(dims);
		};
		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			reject(new Error('No se pudieron leer las dimensiones de la imagen.'));
		};
		img.src = objectUrl;
	});
}

/**
 * Recorte cover centrado para encajar en TARGET_RATIO.
 * @param {{ width: number, height: number }} dims
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function buildInitialCrop({ width, height }) {
	const srcRatio = width / Math.max(1, height);
	let cropWidth;
	let cropHeight;
	if (srcRatio >= TARGET_RATIO) {
		cropHeight = height;
		cropWidth = Math.round(height * TARGET_RATIO);
	} else {
		cropWidth = width;
		cropHeight = Math.round(width / TARGET_RATIO);
	}
	const x = Math.max(0, Math.round((width - cropWidth) / 2));
	const y = Math.max(0, Math.round((height - cropHeight) / 2));
	return { x, y, width: cropWidth, height: cropHeight };
}

/**
 * @param {{ width: number, height: number }} dims
 * @param {{ x: number, y: number, width: number, height: number }} crop
 */
export function fitCropRect(dims, crop) {
	const maxX = Math.max(0, dims.width - crop.width);
	const maxY = Math.max(0, dims.height - crop.height);
	return {
		x: Math.min(Math.max(0, crop.x), maxX),
		y: Math.min(Math.max(0, crop.y), maxY),
		width: crop.width,
		height: crop.height,
	};
}

/**
 * @param {string} previewUrl
 * @param {{ x: number, y: number, width: number, height: number }} crop
 * @param {{ width?: number, height?: number }} [outputSize]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function canvasFromCrop(previewUrl, crop, outputSize) {
	const img = new Image();
	img.crossOrigin = 'anonymous';
	const loaded = new Promise((resolve, reject) => {
		img.onload = resolve;
		img.onerror = reject;
	});
	img.src = previewUrl;
	await loaded;
	const out = document.createElement('canvas');
	out.width = outputSize?.width ?? Math.max(OUTPUT_WIDTH, Math.round(crop.width));
	out.height = outputSize?.height ?? Math.max(OUTPUT_HEIGHT, Math.round(crop.height));
	const ctx = out.getContext('2d');
	if (!ctx) throw new Error('No se pudo preparar el editor.');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(
		img,
		crop.x,
		crop.y,
		crop.width,
		crop.height,
		0,
		0,
		out.width,
		out.height,
	);
	return out;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} mimeType
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas, mimeType) {
	return new Promise((resolve, reject) => {
		canvas.toBlob((out) => {
			if (!out) {
				reject(new Error('No se pudo exportar la imagen.'));
				return;
			}
			resolve(out);
		}, mimeType || 'image/jpeg', EXPORT_QUALITY);
	});
}

/**
 * Ajusta cualquier imagen al formato del carrusel (2.35:1, 1920x817) con cover centrado.
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function autoFitCarouselImage(file) {
	const dimensions = await readImageDimensions(file);
	const crop = buildInitialCrop(dimensions);
	const previewUrl = URL.createObjectURL(file);
	try {
		const canvas = await canvasFromCrop(previewUrl, crop, {
			width: OUTPUT_WIDTH,
			height: OUTPUT_HEIGHT,
		});
		const mimeType = file.type || 'image/jpeg';
		const blob = await canvasToBlob(canvas, mimeType);
		const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
		return new File([blob], `carousel-fitted-${Date.now()}.${ext}`, {
			type: blob.type || mimeType,
		});
	} finally {
		URL.revokeObjectURL(previewUrl);
	}
}
