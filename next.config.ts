/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import './src/env'

import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import path from 'path'

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
                hostname: 'utfs.io',
                pathname: '/a/vsku5b7hpr/**',
                search: ''
            },
            {
                protocol: 'https',
                hostname: 'img.clerk.com',
                pathname: '/**',
                search: ''
            }
        ]
    },
    rewrites: async () => {
        return [
            {
                source: '/ingest/static/:path*',
                destination: 'https://us-assets.i.posthog.com/static/:path*'
            },
            {
                source: '/ingest/:path*',
                destination: 'https://us.i.posthog.com/:path*'
            },
            {
                source: '/ingest/decide',
                destination: 'https://us.i.posthog.com/decide'
            }
        ]
    },
    skipTrailingSlashRedirect: true,
    webpack: (config, { isServer }: { isServer: boolean }) => {
        if (!isServer) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            config.resolve.alias.yjs = path.resolve(__dirname, 'node_modules/yjs')
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return config
    }
} satisfies NextConfig

export default withSentryConfig(config, {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    org: 'zed-softworks-llc',
    project: 'nemu',

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
        enabled: true
    },

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: '/monitoring',

    sourcemaps: {
        deleteSourcemapsAfterUpload: true
    },

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true
})
