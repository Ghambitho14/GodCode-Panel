import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'vite';

const server = await createServer({
	mode: 'e2e',
	server: {
		host: '127.0.0.1',
		port: 5174,
		strictPort: true,
	},
});

let runner;
let closing = false;

async function closeAll(signal) {
	if (closing) return;
	closing = true;
	if (runner && runner.exitCode === null) runner.kill(signal);
	await server.close();
}

process.once('SIGINT', () => { void closeAll('SIGINT'); });
process.once('SIGTERM', () => { void closeAll('SIGTERM'); });

try {
	await server.listen();
	runner = spawn(
		process.execPath,
		['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
		{
			cwd: process.cwd(),
			stdio: 'inherit',
			env: { ...process.env, PLAYWRIGHT_EXTERNAL_SERVER: '1' },
		},
	);
	const [code] = await once(runner, 'exit');
	process.exitCode = typeof code === 'number' ? code : 1;
} finally {
	await closeAll('SIGTERM');
}

