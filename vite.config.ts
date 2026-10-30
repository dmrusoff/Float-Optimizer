import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                // Vite 8 (Rolldown) only supports the function form of manualChunks
                manualChunks(id: string) {
                    if (id.includes('node_modules/lucide-react')) return 'vendor-ui'
                },
            },
        },
    },
})
