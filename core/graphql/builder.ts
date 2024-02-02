import { prisma } from '@/lib/prisma'
import SchemaBuilder from '@pothos/core'
import PrismaPlugin from '@pothos/plugin-prisma'
import type PrismaTypes from '@pothos/plugin-prisma/generated'

import { DateTimeResolver } from 'graphql-scalars'
import { ArtistCodeResponse, NemuResponse } from '../responses'
import { DownloadData, PortfolioItem } from '../structures'
import build from 'next/dist/build'

export const builder = new SchemaBuilder<{
    PrismaTypes: PrismaTypes
    Objects: {
        // Data Objects
        PortfolioResponse: PortfolioItem
        DownloadData: DownloadData

        // Response Objects
        NemuResponse: NemuResponse
        ArtistCodeResponse: ArtistCodeResponse
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

// Data Objects
builder.objectRef<PortfolioItem>('PortfolioResponse').implement({
    fields: (t) => ({
        signed_url: t.exposeString('signed_url'),
        image_key: t.exposeString('image_key'),
        name: t.exposeString('name')
    })
})

builder.objectRef<DownloadData>('DownloadData').implement({
    fields: (t) => ({
        name: t.exposeString('name'),
        artist_handle: t.exposeString('artist'),
        price: t.exposeFloat('price'),
        download_url: t.exposeString('url')
    })
})


// Response Objects
builder.objectRef<NemuResponse>('NemuResponse').implement({
    fields: (t) => ({
        status: t.exposeInt('status'),
        message: t.exposeString('message', { nullable: true })
    })
})

builder.objectRef<ArtistCodeResponse>('ArtistCodeResponse').implement({
    fields: (t) => ({
        status: t.exposeInt('status'),
        message: t.exposeString('message', {nullable: true}),
        generated_code: t.exposeString('generated_code', {nullable: true})
    })
})

// Scalars
builder.addScalarType('Date', DateTimeResolver, {})