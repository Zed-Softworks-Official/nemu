import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '~': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
        setupFiles: ['./vitest.setup.ts'],
        env: {
            SKIP_ENV_VALIDATION: '1',
            NEXT_PUBLIC_CONVEX_URL: 'https://convex.test',
            NEXT_PUBLIC_SITE_URL: 'https://nemu.test',
            NEXT_PUBLIC_DASHBOARD_URL: 'https://dashboard.nemu.test',
        },
    },
})
