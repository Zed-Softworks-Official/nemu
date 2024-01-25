import { createYoga } from 'graphql-yoga'
import { schema } from '@/core/graphql/schema'

const { handleRequest } = createYoga({
    schema,

    graphqlEndpoint: '/api/graphql',

    fetchAPI: { Request: Request, Response: Response }
})

export { handleRequest as GET, handleRequest as POST }
