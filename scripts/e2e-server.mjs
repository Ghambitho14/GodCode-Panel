import { createServer } from 'vite';

const server = await createServer({
	mode: 'e2e',
	server: {
		host: '127.0.0.1',
		port: 5174,
		strictPort: true,
	},
});

await server.listen();

let closing = false;
async function closeServer() {
	if (closing) return;
	closing = true;
	await server.close();
	process.exit(0);
}

process.once('SIGINT', closeServer);
process.once('SIGTERM', closeServer);

