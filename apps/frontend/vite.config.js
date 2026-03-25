import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    css: {
        postcss: './postcss.config.cjs',
    },
    server: {
        host: true,
        port: 5173,
        allowedHosts: [
            'brynlee-macrolecithal-uncommiseratively.ngrok-free.dev'
        ]
    }
});
