/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import './src/env'
import { withMicrofrontends } from '@vercel/microfrontends/next/config'
import type { NextConfig } from 'next'

const config: NextConfig = {
    allowedDevOrigins: ['nemu.local', '*.nemu.local'],
    transpilePackages: ['@nemu/ui'],
    basePath: '/dashboard',
}

export default withMicrofrontends(config)
