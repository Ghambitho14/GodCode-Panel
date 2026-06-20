import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_DOCUMENT_DESCRIPTION,
	DEFAULT_DOCUMENT_TITLE,
	resetDocumentMeta,
	setDocumentMeta,
} from "@/shared/utils/documentMeta";

function metaContent(selector: string): string | null {
	return document.querySelector<HTMLMetaElement>(selector)?.getAttribute("content") ?? null;
}

describe("documentMeta", () => {
	beforeEach(() => {
		document.head.innerHTML = "";
		document.title = "";
	});

	afterEach(() => {
		document.head.innerHTML = "";
		document.title = "";
	});

	it("setDocumentMeta updates title, description and OG/Twitter tags", () => {
		setDocumentMeta({
			title: "Mi Local",
			description: "Panel de caja y operación de Mi Local",
			imageUrl: "https://cdn.example.com/logo.png",
		});

		expect(document.title).toBe("Mi Local");
		expect(metaContent('meta[name="description"]')).toBe(
			"Panel de caja y operación de Mi Local",
		);
		expect(metaContent('meta[property="og:title"]')).toBe("Mi Local");
		expect(metaContent('meta[property="og:description"]')).toBe(
			"Panel de caja y operación de Mi Local",
		);
		expect(metaContent('meta[property="og:image"]')).toBe("https://cdn.example.com/logo.png");
		expect(metaContent('meta[name="twitter:title"]')).toBe("Mi Local");
		expect(metaContent('meta[name="twitter:description"]')).toBe(
			"Panel de caja y operación de Mi Local",
		);
		expect(metaContent('meta[name="twitter:image"]')).toBe("https://cdn.example.com/logo.png");
	});

	it("setDocumentMeta falls back to /logo.png for invalid imageUrl", () => {
		setDocumentMeta({
			title: "Test",
			description: "Desc",
			imageUrl: "javascript:alert(1)",
		});

		expect(metaContent('meta[property="og:image"]')).toBe("/logo.png");
		expect(metaContent('meta[name="twitter:image"]')).toBe("/logo.png");
	});

	it("resetDocumentMeta restores default login values", () => {
		setDocumentMeta({
			title: "Tenant X",
			description: "Custom",
			imageUrl: "https://cdn.example.com/x.png",
		});

		resetDocumentMeta();

		expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE);
		expect(metaContent('meta[name="description"]')).toBe(DEFAULT_DOCUMENT_DESCRIPTION);
		expect(metaContent('meta[property="og:title"]')).toBe(DEFAULT_DOCUMENT_TITLE);
		expect(metaContent('meta[property="og:image"]')).toBe("/logo.png");
	});
});
