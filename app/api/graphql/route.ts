import { prisma } from '@/lib/prisma'
import { createSchema, createYoga } from 'graphql-yoga'

const { handleRequest } = createYoga({
    schema: createSchema({
        typeDefs: /* GraphQL */ `
            type Query {
                user(id: String!): User
            }
            
            scalar Date

            type User {
                id: String
                name: String
                email: String
                emailVerified: Date
                image: String
                role: Int
            }
        `,
        resolvers: {
            Query: {
                user: (_, args) => {
                    return prisma.user.findFirst({
                        where: {
                            id: args.id
                        }
                    })
                }
            }
        }
    }),

    graphqlEndpoint: '/api/graphql',

    fetchAPI: { Request: Request, Response: Response }
})

export { handleRequest as GET, handleRequest as POST }
