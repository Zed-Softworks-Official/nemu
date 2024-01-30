import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'
import { AWSLocations } from '@/core/structures'
import { S3Upload } from '@/core/storage'

builder.prismaObject('Portfolio', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        image: t.exposeString('image'),
        name: t.exposeString('name'),
        artist: t.relation('artist')
    })
})

builder.queryField('portfolio_item', (t) =>
    t.prismaField({
        type: 'Portfolio',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: 'The artists handle for the image'
            }),
            item_id: t.arg({
                type: 'String',
                required: true,
                description: 'The specific item id you are requesting'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.portfolio.findFirstOrThrow({
                ...query,
                where: {
                    artistId: args.artist_id,
                    id: args.item_id
                }
            })
    })
)

/**
 * Create Portfolio Item
 * 
 * Mutation field that creates a portfolio item and uploads
 */
builder.mutationField('create_portfolio_item', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            image: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            name: t.arg({
                type: 'String',
                required: true,
                description: ''
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Create Portfolio Item
            const item = await prisma.portfolio.create({
                data: {
                    artistId: args.artist_id,
                    name: args.name,
                    image: args.image
                }
            })

            if (!item) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Error creating entry in database'
                }
            }

            return {
                status: StatusCode.Success
            }
        }
    })
)