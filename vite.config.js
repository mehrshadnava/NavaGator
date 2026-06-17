import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [
    {
      name: 'autosave-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          console.log(`[Vite Middleware] ${req.method} ${req.url}`);
          if (req.method === 'POST' && req.url.startsWith('/api/save-database')) {
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                if (!data.fileData) {
                  throw new Error("Missing fileData field in request body.");
                }
                const buffer = Buffer.from(data.fileData, 'base64');
                fs.writeFileSync(path.resolve('database.xlsx'), buffer);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } catch (err) {
                console.error('Autosave server middleware error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ]
});
