import { prisma } from '@/lib/prisma'
import SchemaBuilder from '@pothos/core'
import PrismaPlugin from '@pothos/plugin-prisma'
import type PrismaTypes from '@pothos/plugin-prisma/generated'

import { DateTimeResolver } from 'graphql-scalars'
import { ArtistCodeResponse, NemuResponse } from '../responses'
import { CommissionItem, DownloadData, PortfolioItem } from '../structures'

export const builder = new SchemaBuilder<{
    PrismaTypes: PrismaTypes
    Objects: {
        // Data Objects
        PortfolioResponse: PortfolioItem
        DownloadData: DownloadData
        CommissionResponse: CommissionItem

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

builder.objectRef<CommissionItem>('CommissionResponse').implement({
    fields: (t) => ({
        title: t.exposeString('title'),
        description: t.exposeString('description'),
        price: t.exposeFloat('price'),

        featured_image: t.exposeString('featured_image', { nullable: true }),
        availability: t.exposeInt('availability', { nullable: true }),
        form_id: t.exposeString('form_id', { nullable: true }),
        slug: t.exposeString('slug', { nullable: true })
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
        message: t.exposeString('message', { nullable: true }),
        generated_code: t.exposeString('generated_code', { nullable: true })
    })
})

// Scalars
builder.addScalarType('Date', DateTimeResolver, {})
