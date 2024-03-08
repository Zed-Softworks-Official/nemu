import { prisma } from '@/lib/prisma'
import SchemaBuilder from '@pothos/core'
import PrismaPlugin from '@pothos/plugin-prisma'
import type PrismaTypes from '@pothos/plugin-prisma/generated'

import { DateTimeResolver } from 'graphql-scalars'
import {
    ArtistCodeResponse,
    CommissionFormCreateResponse,
    CommissionImagesResponse,
    KanbanResponse,
    NemuResponse,
    StripeCustomerIdResponse
} from '../responses'
import { CommissionForm, CommissionItem, DownloadData, KanbanContainerData, KanbanTask, PortfolioItem } from '../structures'
import { AWSFileModification } from '../data-structures/form-structures'

export const builder = new SchemaBuilder<{
    PrismaTypes: PrismaTypes
    Objects: {
        // Data Objects
        PortfolioData: PortfolioItem
        DownloadData: DownloadData
        CommissionData: CommissionItem
        CommissionFormData: CommissionForm
        AWSFileModification: AWSFileModification
        KanbanContainerData: KanbanContainerData
        KanbanTask: KanbanTask

        // Response Objects
        NemuResponse: NemuResponse
        CommissionFormCreateResponse: CommissionFormCreateResponse
        ArtistCodeResponse: ArtistCodeResponse
        StripeCustomerIdResponse: StripeCustomerIdResponse
        CommissionImagesResponse: CommissionImagesResponse
        KanbanResponse: KanbanResponse
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

//////////////////////////////////////
// Data Objects
//////////////////////////////////////
builder.objectRef<PortfolioItem>('PortfolioData').implement({
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

builder.objectRef<CommissionItem>('CommissionData').implement({
    fields: (t) => ({
        title: t.exposeString('title'),
        description: t.exposeString('description'),
        price: t.exposeFloat('price'),

        featured_image: t.exposeString('featured_image', { nullable: true }),
        availability: t.exposeInt('availability', { nullable: true }),
        form_id: t.exposeString('form_id', { nullable: true }),
        handle: t.exposeString('handle', { nullable: true }),
        slug: t.exposeString('slug', { nullable: true }),
        images: t.exposeStringList('images', { nullable: true }),
        commission_id: t.exposeString('commission_id', { nullable: true }),
        published: t.exposeBoolean('published', { nullable: true }),
        use_invoicing: t.exposeBoolean('use_invoicing', { nullable: true })
    })
})

builder.objectRef<CommissionForm>('CommissionFormData').implement({
    fields: (t) => ({
        user_submitted: t.exposeBoolean('user_submitted'),
        content: t.exposeString('content')
    })
})

builder.objectRef<AWSFileModification>('AWSFileModification').implement({
    fields: (t) => ({
        file_key: t.exposeString('file_key'),
        aws_location: t.exposeInt('aws_location'),
        signed_url: t.exposeString('signed_url', { nullable: true }),
        file_name: t.exposeString('file_name', { nullable: true }),
        featured: t.exposeBoolean('featured', { nullable: true })
    })
})

builder.objectRef<KanbanContainerData>('KanbanContainerData').implement({
    fields: (t) => ({
        id: t.exposeID('id'),
        title: t.exposeString('title')
    })
})

builder.objectRef<KanbanTask>('KanbanTask').implement({
    fields: (t) => ({
        id: t.exposeID('id'),
        container_id: t.exposeID('container_id'),
        content: t.exposeString('content')
    })
})

//////////////////////////////////////
// Response Objects
//////////////////////////////////////
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

builder.objectRef<CommissionFormCreateResponse>('CommissionFormCreateResponse').implement({
    fields: (t) => ({
        status: t.exposeInt('status'),
        message: t.exposeString('message', { nullable: true }),
        form_id: t.exposeString('form_id')
    })
})

builder.objectRef<StripeCustomerIdResponse>('StripeCustomerIdResponse').implement({
    fields: (t) => ({
        status: t.exposeInt('status'),
        message: t.exposeString('message', { nullable: true }),
        customer_id: t.exposeString('customer_id', { nullable: true }),
        stripe_account: t.exposeString('stripe_account', { nullable: true })
    })
})

builder.objectRef<CommissionImagesResponse>('CommissionImagesResponse').implement({
    fields: (t) => ({
        status: t.exposeInt('status'),
        message: t.exposeString('message', { nullable: true }),
        images: t.expose('images', { nullable: true, type: ['AWSFileModification'] })
    })
})

builder.objectRef<KanbanResponse>('KanbanResponse').implement({
    fields: (t) => ({
        status: t.exposeInt('status'),
        message: t.exposeString('message', { nullable: true }),
        id: t.exposeString('id', { nullable: true }),
        containers: t.expose('containers', { nullable: true, type: ['KanbanContainerData'] }),
        tasks: t.expose('tasks', { nullable: true, type: ['KanbanTask'] })
    })
})

// Scalars
builder.addScalarType('Date', DateTimeResolver, {})
