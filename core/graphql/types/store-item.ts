import { prisma } from '@/lib/prisma'
import { StoreProductInputType, builder } from '../builder'
import { StatusCode } from '@/core/responses'
import { StripeCreateStoreProduct } from '@/core/payments'

builder.prismaObject('StoreItem', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        productId: t.exposeString('product'),
        StripeAccount: t.exposeString('stripeAccId'),
        handle: t.exposeString('handle'),
        slug: t.exposeString('slug'),

        artist: t.relation('artist')
    })
})

builder.queryField('store_item', (t) =>
    t.prismaField({
        type: 'StoreItem',
        args: {
            productId: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the product'
            }),
            stripeAccount: t.arg({
                type: 'String',
                required: true,
                description: 'The account id of the product requested'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.storeItem.findFirstOrThrow({
                ...query,
                where: {
                    stripeAccId: args.stripeAccount,
                    product: args.productId
                }
            })
    })
)

builder.mutationField('create_store_item', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the artist'
            }),
            product_data: t.arg({
                type: StoreProductInputType,
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
            const slug = args.product_data.name
                .toLowerCase()
                .replace(/[^a-zA-Z ]/g, '')
                .replaceAll(' ', '-')

            // Create the Stripe Product
            const product = await StripeCreateStoreProduct(artist.stripeAccId, {
                name: args.product_data.name,
                description: args.product_data.description,
                price: args.product_data.price,
                images: args.product_data.additional_images,
                featured_image: args.product_data.featured_image,
                downloadable_asset: args.product_data.downloadable_asset,
                slug: slug
            })

            // Create the item in the database
            await prisma.storeItem.create({
                data: {
                    artistId: args.artist_id,
                    stripeAccId: artist.stripeAccId,
                    product: product.id,
                    slug: slug,
                    handle: artist.handle
                }
            })

            return {
                status: StatusCode.Success
            }
        }
    })
)
