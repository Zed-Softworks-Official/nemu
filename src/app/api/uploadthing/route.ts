import { createRouteHandler } from 'uploadthing/server'
import { nemuFileRouter } from './core'

export const { GET, POST } = createRouteHandler({
    router: nemuFileRouter
})
