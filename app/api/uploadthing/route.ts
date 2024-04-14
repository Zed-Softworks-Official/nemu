import { createRouteHandler } from 'uploadthing/next'

import { nemuFileRouter } from './core'

// Export routes for Next App Router
export const { GET, POST } = createRouteHandler({
    router: nemuFileRouter,

    // Apply an (optional) custom config:
    // config: { ... },
})
