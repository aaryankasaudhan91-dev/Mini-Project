import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    root: 'frontend',
    server: {
        port: 5173,
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, 'frontend/index.html'),
            },
        },
    },
});