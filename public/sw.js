/* PWA mínimo: permite criterios de instalación del navegador sin cachear HTML/API. */
const VERSION = "tenant-panel-pwa-v1";

self.addEventListener("install", (event) => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
	event.respondWith(fetch(event.request));
});
