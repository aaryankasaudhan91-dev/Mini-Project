import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve config independently of the directory used to start the server.
dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
