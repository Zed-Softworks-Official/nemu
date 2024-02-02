import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'

builder.prismaObject('Form', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        commissionId: t.exposeString('commissionId'),

        name: t.exposeString('name'),
        description: t.exposeString('description'),
        createdAt: t.expose('createdAt', { type: 'Date' }),
        content: t.exposeString('content'),

        submissions: t.exposeInt('submissions'),

        artist: t.relation('artist'),
        formSubmissions: t.relation('formSubmissions')
    })
})

builder.queryField('forms', (t) =>
    t.prismaField({
        type: ['Form'],
        args: {
            artistId: t.arg({
                type: 'String',
                required: true,
                description: 'The artist id for which to get the forms'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.form.findMany({
                ...query,
                where: {
                    artistId: args.artistId
                }
            })
    })
)

builder.queryField('form', (t) =>
    t.prismaField({
        type: 'Form',
        args: {
            artistId: t.arg({
                type: 'String',
                required: true,
                description: 'The artist id for which to get the form'
            }),
            formId: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the form'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.form.findFirstOrThrow({
                ...query,
                where: {
                    id: args.formId,
                    artistId: args.artistId
                }
            })
    })
)

/**
 * 
 */
builder.mutationField('create_new_form', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true
            }),
            form_name: t.arg({
                type: 'String',
                required: true
            }),
            form_desc: t.arg({
                type: 'String',
                required: true
            }),
            commission_id: t.arg({
                type: 'String',
                required: false
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            const form = await prisma.form.create({
                data: {
                    artistId: args.artist_id,
                    commissionId: args.commission_id,
                    name: args.form_name,
                    description: args.form_desc
                }
            })

            if (!form) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Form could not be created!'
                }
            }

            return { status: StatusCode.Success }
        }
    })
)
