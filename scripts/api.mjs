import { copyFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

if (!existsSync('db.json')) copyFileSync('db.seed.json', 'db.json');
spawn('npx', ['json-server', '--watch', 'db.json', '--port', '3001', '--routes', 'routes.json'], { stdio: 'inherit', shell: true });
