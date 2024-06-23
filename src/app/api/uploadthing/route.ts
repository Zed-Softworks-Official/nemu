import { createRouteHandler } from 'uploadthing/next'
import { nemuFileRouter } from '~/app/api/uploadthing/core'

export const { GET, POST } = createRouteHandler({
    router: nemuFileRouter
})
