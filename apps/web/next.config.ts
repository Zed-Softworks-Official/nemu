/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import './src/env'
import type { NextConfig } from 'next'

const config: NextConfig = {
    allowedDevOrigins: ['nemu.local', '*.nemu.local'],
    transpilePackages: ['@nemu/ui', '@nemu/assets'],
    async rewrites() {
        return {
            // Run before the App Router `/` page so get.nemu.sh can serve install.sh
            beforeFiles: [
                {
                    source: '/',
                    has: [{ type: 'host', value: 'get.nemu.sh' }],
                    destination: '/install.sh',
                },
            ],
        }
    },
}

export default config
