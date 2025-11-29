import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true
            },
            '/recordings': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                // Enable proper Range request handling for video seeking
                configure: (proxy) => {
                    proxy.on('proxyRes', (proxyRes, req, res) => {
                        // Ensure Accept-Ranges header is passed through
                        if (!proxyRes.headers['accept-ranges']) {
                            proxyRes.headers['accept-ranges'] = 'bytes';
                        }
                    });
                }
            }
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: false
    }
});
