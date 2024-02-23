import { prisma } from '@/lib/prisma'
import { builder } from '../builder'

builder.prismaObject('FormSubmission', {
    fields: (t) => ({
        id: t.exposeString('id'),
        formId: t.exposeString('formId'),
        userId: t.exposeString('userId'),
        createdAt: t.expose('createdAt', { type: 'Date' }),
        content: t.exposeString('content'),

        commissionStatus: t.exposeInt('commissionStatus'),

        paymentIntent: t.exposeString('paymentIntent', { nullable: true }),
        paymentStatus: t.exposeInt('paymentStatus'),
        orderId: t.exposeString('orderId'),
        invoiceId: t.exposeString('invoiceId', { nullable: true }),
        invoiceSent: t.exposeBoolean('invoiceSent'),
        invoiceContent: t.exposeString('invoiceContent', { nullable: true }),
        invoiceHostedUrl: t.exposeString('invoiceHostedUrl', { nullable: true }),

        form: t.relation('form'),
        user: t.relation('user')
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
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.formSubmission.findFirstOrThrow({
                ...query,
                where: {
                    orderId: args.order_id || undefined,
                    id: args.submission_id || undefined
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
