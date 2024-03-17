import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'

builder.prismaObject('FormSubmission', {
    fields: (t) => ({
        id: t.exposeString('id'),
        formId: t.exposeString('formId'),
        userId: t.exposeString('userId'),
        createdAt: t.expose('createdAt', { type: 'Date' }),
        content: t.exposeString('content'),
        waitlist: t.exposeBoolean('waitlist'),

        commissionStatus: t.exposeInt('commissionStatus'),

        paymentIntent: t.exposeString('paymentIntent', { nullable: true }),
        paymentStatus: t.exposeInt('paymentStatus'),
        orderId: t.exposeString('orderId'),
        invoiceId: t.exposeString('invoiceId', { nullable: true }),
        invoiceSent: t.exposeBoolean('invoiceSent'),
        invoiceContent: t.exposeString('invoiceContent', { nullable: true }),
        invoiceHostedUrl: t.exposeString('invoiceHostedUrl', { nullable: true }),

        sendbirdChannelURL: t.exposeString('sendbirdChannelURL', {nullable: true}),

        downloadId: t.exposeString('downloadId', {nullable: true}),
        download: t.prismaField({
            type: 'Downloads',
            nullable: true,
            resolve: (query, parent) => prisma.downloads.findFirst({
                ...query,
                where: {
                    id: parent.downloadId!
                }
            })
        }),

        form: t.relation('form'),
        user: t.relation('user'),
        kanban: t.field({
            type: 'KanbanResponse',
            resolve: async (parent, _args, _ctx, _info) => {
                const kanban = await prisma.kanban.findFirst({
                    where: {
                        id: parent.kanbanId
                    }
                })

                if (!kanban) {
                    return {
                        status: StatusCode.InternalError,
                        message: 'Could not find kanban board'
                    }
                }

                return {
                    status: StatusCode.Success,
                    id: kanban.id,
                    containers: JSON.parse(kanban.containers),
                    tasks: JSON.parse(kanban.tasks)
                }
            }
        })
    })
})

builder.queryField('form_submission', (t) =>
    t.prismaField({
        type: 'FormSubmission',
        args: {
            order_id: t.arg({
                type: 'String',
                required: false,
                description: ''
            }),
            submission_id: t.arg({
                type: 'String',
                required: false,
                description: ''
            }),
            channel_url: t.arg({
                type: 'String',
                required: false,
                description: ''
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.formSubmission.findFirstOrThrow({
                ...query,
                where: {
                    orderId: args.order_id || undefined,
                    id: args.submission_id || undefined,
                    sendbirdChannelURL: args.channel_url || undefined
                }
            })
    })
)

builder.queryField('form_submissions', (t) =>
    t.prismaField({
        type: ['FormSubmission'],
        args: {
            user_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.formSubmission.findMany({
                ...query,
                where: {
                    userId: args.user_id
                }
            })
    })
)
