import { createRouteHandler } from 'uploadthing/server'
import { nemuFileRouter } from '~/app/api/uploadthing/core'

export const { GET, POST } = createRouteHandler({
    router: nemuFileRouter
})
