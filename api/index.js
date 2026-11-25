import app from '../server.js';

// Vercel puede entregar la ruta al handler sin el prefijo de la función.
// Normalizarla permite conservar las mismas rutas /api/... en local y producción.
export default function handler(req, res) {
  if (!req.url.startsWith('/api')) req.url = `/api${req.url === '/' ? '' : req.url}`;
  return app(req, res);
}
