import { prisma } from '@/lib/prisma'
import SchemaBuilder from '@pothos/core'
import PrismaPlugin from '@pothos/plugin-prisma'
import type PrismaTypes from '@pothos/plugin-prisma/generated'

import { DateTimeResolver } from 'graphql-scalars'
import { NemuResponse } from '../responses'

export const builder = new SchemaBuilder<{
    PrismaTypes: PrismaTypes
    Objects: {
        PortfolioResponse: { signed_url: string; name: string }
        NemuResponse: NemuResponse
        File: File
    }
    Scalars: { Date: { Input: Date; Output: Date } }
}>({
    plugins: [PrismaPlugin],
    prisma: {
        client: prisma
    }
})

builder.queryType({
    description: 'The Query Root Type'
})

builder.mutationType({
    description: 'The Mutation Root Type'
})

builder.objectRef<NemuResponse>('NemuResponse').implement({
    fields: (t) => ({
        status: t.exposeInt('status'),
        message: t.exposeString('message', { nullable: true })
    })
})

builder.addScalarType('Date', DateTimeResolver, {})
