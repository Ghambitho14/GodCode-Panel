import { sileo } from "sileo";

export type PanelNotifyType = "success" | "error" | "warning" | "info";

const DEFAULT_DURATION_MS = 3000;

const PANEL_TOAST_OPTS = {
	fill: "#ffffff",
	roundness: 14,
} as const;

export function panelNotify(message: string, type: PanelNotifyType = "success"): void {
	const opts = { title: message, duration: DEFAULT_DURATION_MS, ...PANEL_TOAST_OPTS };

	switch (type) {
		case "error":
			sileo.error(opts);
			break;
		case "warning":
			sileo.warning(opts);
			break;
		case "info":
			sileo.info(opts);
			break;
		default:
			sileo.success(opts);
			break;
	}
}
