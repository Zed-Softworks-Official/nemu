import { clerkMiddleware } from '@clerk/nextjs/server'

/**
 * Dashboard may be configured with NEXT_PUBLIC_CLERK_PROXY_URL=/__clerk
 * (Clerk Dashboard proxy / satellite cutover). Without frontendApiProxy,
 * /__clerk/npm/@clerk/clerk-js/... 404s and Clerk fails to load.
 *
 * Same-root subdomains (dashboard.nemu.sh + nemu.sh) normally share
 * sessions via clerk.nemu.sh and do not need a proxy — prefer unsetting
 * NEXT_PUBLIC_CLERK_PROXY_URL if you are not intentionally proxying FAPI.
 */
export default clerkMiddleware({
    frontendApiProxy: {
        enabled: true,
    },
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
        // Always run for Clerk Frontend API proxy paths
        '/__clerk/(.*)',
    ],
}
