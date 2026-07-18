/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import './src/env'
import { withMicrofrontends } from '@vercel/microfrontends/next/config'
import type { NextConfig } from 'next'

/**
 * Shared public assets (e.g. the logo used by `@nemu/ui`) live in `apps/web/public`.
 * The dashboard's image optimizer resolves relative `src` paths against this app,
 * so proxy those asset requests to the web app instead.
 */
const webAssetOrigin =
    process.env.NODE_ENV === 'development'
        ? 'http://localhost:3024' // microfrontends local proxy (see microfrontends.json)
        : 'https://nemu.sh'

const config: NextConfig = {
    allowedDevOrigins: ['nemu.local', '*.nemu.local'],
    transpilePackages: ['@nemu/ui'],
    async rewrites() {
        // Keep in sync with apps/web/public
        const publicAssets = [
            '/dizzy.png',
            '/favicon.ico',
            '/icon.png',
            '/logo-dark.png',
            '/logo-light.png',
            '/not-like-this.png',
            '/note-take.png',
            '/portrait.png',
            '/sad.png',
            '/sparkle.png',
            '/star.png',
            '/this-is-fine.png',
        ]

        return publicAssets.map((path) => ({
            source: path,
            destination: `${webAssetOrigin}${path}`,
        }))
    },
}

export default withMicrofrontends(config)
