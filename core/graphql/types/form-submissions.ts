import { builder } from '../builder'

builder.prismaObject('FormSubmission', {
    fields: (t) => ({
        id: t.exposeString('id'),
        formId: t.exposeString('formId'),
        userId: t.exposeString('userId'),
        createdAt: t.expose('createdAt', { type: 'Date' }),
        content: t.exposeString('content'),

        paymentIntent: t.exposeString('paymentIntent', { nullable: true }),
        paymentStatus: t.exposeInt('pyamentStatus'),
        orderId: t.exposeString('orderId', { nullable: true }),

        form: t.relation('form'),
        user: t.relation('user')
    })
})
