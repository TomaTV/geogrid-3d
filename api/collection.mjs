import { readFileSync } from 'node:fs';
import jsonServer from 'json-server';

// Sur Vercel le disque n'est pas conservé : la collection vit en mémoire et repart de db.seed.json à chaque démarrage à froid.
const seed = JSON.parse(readFileSync(new URL('../db.seed.json', import.meta.url), 'utf8'));
const app = jsonServer.create();
app.use(jsonServer.router(seed));

export default function handler(req, res) {
  const url = new URL(req.url, 'http://local');
  const path = url.searchParams.get('path') ?? '';
  url.searchParams.delete('path');
  req.url = '/' + path + url.search;
  req.query = Object.fromEntries(url.searchParams);
  app(req, res);
}
