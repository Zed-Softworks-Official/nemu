/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import './src/env.js'

/** @type {import("next").NextConfig} */
const config = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'utfs.io',
                pathname: '/a/74fsewdwmb/**',
                search: ''
            },
            {
                protocol: 'https',
                hostname: 'img.clerk.com',
                pathname: '/**',
                search: ''
            }
        ]
    }
}

export default config
