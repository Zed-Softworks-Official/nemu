/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import './src/env'
import type { NextConfig } from 'next'
import nextra from 'nextra'

const withNextra = nextra({})

const config: NextConfig = {
    transpilePackages: ['@nemu/assets'],
}

export default withNextra(config)
