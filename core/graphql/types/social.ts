import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'

builder.prismaObject('Social', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        agent: t.exposeString('agent'),
        url: t.exposeString('url'),

        artist: t.relation('artist')
    })
})

builder.mutationField('create_social', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            agent: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            url: t.arg({
                type: 'String',
                required: true,
                description: ''
            })
        },
        resolve: async (root, args) => {
            const social = await prisma.social.create({
                data: {
                    artistId: args.artist_id,
                    agent: args.agent,
                    url: args.url
                }
            })

            if (!social) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Error creating social object'
                }
            }

            return {
                status: StatusCode.Success
            }
        }
    })
)
