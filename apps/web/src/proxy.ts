import { clerkMiddleware } from '@clerk/nextjs/server'

const isLiveClerk =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_') ??
    false

export default clerkMiddleware({
    frontendApiProxy: {
        enabled: isLiveClerk,
    },
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
        // Always run for Clerk proxy + @clerk/ui npm script routes (end in .js)
        '/__clerk/(.*)',
    ],
}
