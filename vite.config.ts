import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Dev-only plugin: POST /__save-layout rewrites defaultPlacements in main.ts.
function saveLayoutPlugin(): Plugin {
  return {
    name: 'save-layout',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-layout', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const placements = JSON.parse(body) as unknown[];
            const mainPath = resolve(server.config.root, 'src/main.ts');
            let source = readFileSync(mainPath, 'utf8');
            const serialized = JSON.stringify(placements, null, 2);
            source = source.replace(
              /const defaultPlacements = \[[\s\S]*?\];/,
              `const defaultPlacements = ${serialized};`,
            );
            writeFileSync(mainPath, source, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [saveLayoutPlugin()],
  // PORT lets a second dev server (e.g. the verification preview) coexist with
  // a manually started one on the default 5173.
  server: { port: Number(process.env.PORT) || 5173 },
});
