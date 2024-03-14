import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'

builder.prismaObject('Product', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),

        title: t.exposeString('title'),
        description: t.exposeString('description'),
        price: t.exposeFloat('price'),
        featuredImage: t.exposeString('featuredImage'),
        additionalImages: t.exposeStringList('additionalImages'),
        slug: t.exposeString('slug'),

        createdAt: t.expose('createdAt', { type: 'Date' }),

        artist: t.relation('artist')
    })
})

builder.queryField('product', (t) =>
    t.prismaField({
        type: 'Product',
        args: {
            product_id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the product'
            }),
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: 'The account id of the product requested'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.product.findFirstOrThrow({
                ...query,
                where: {
                    id: args.product_id,
                    artistId: args.artist_id
                }
            })
    })
)

builder.mutationField('create_product', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the artist'
            }),
            product_data: t.arg({
                type: 'StoreProductInputType',
                required: true,
                description: 'the data of the product'
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Get Artist
            const artist = await prisma.artist.findFirst({
                where: {
                    id: args.artist_id
                }
            })

            if (!artist) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Could not find artist!'
                }
            }

            // Create Product Slug
            const slug = args.product_data
                .title!.toLowerCase()
                .replace(/[^a-zA-Z ]/g, '')
                .replaceAll(' ', '-')

            // Create the item in the database
            await prisma.product.create({
                data: {
                    artistId: args.artist_id,
                    title: args.product_data.title!,
                    description: args.product_data.description!,
                    price: args.product_data.price!,
                    featuredImage: args.product_data.featured_image!,
                    additionalImages: args.product_data.additional_images!,
                    downloadableAsset: args.product_data.downloadable_asset!,
                    slug: slug
                }
            })

            return {
                status: StatusCode.Success
            }
        }
    })
)

builder.mutationField('update_product', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            product_id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the item'
            }),
            product_data: t.arg({
                type: 'StoreProductInputType',
                required: true,
                description: 'The data to update'
            })
        },
        resolve: async (_parent, args) => {
            try {
                await prisma.product.update({
                    where: {
                        id: args.product_id
                    },
                    data: {
                        title: args.product_data.title || undefined,
                        description: args.product_data.description || undefined,
                        price: args.product_data.price || undefined,
                        featuredImage: args.product_data.featured_image || undefined,
                        additionalImages: args.product_data.additional_images || undefined,
                        downloadableAsset: args.product_data.downloadable_asset || undefined,
                        published: args.product_data.published != undefined ? args.product_data.published : undefined
                    }
                })
            } catch (e) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Unable to update store item'
                }
            }

            return {
                status: StatusCode.Success
            }
        }
    })
)
