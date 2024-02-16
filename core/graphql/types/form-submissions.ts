import { StatusCode } from '@/core/responses'
import { builder } from '../builder'
import { prisma } from '@/lib/prisma'

builder.prismaObject('FormSubmission', {
    fields: (t) => ({
        id: t.exposeString('id'),
        formId: t.exposeString('formId'),
        userId: t.exposeString('userId'),
        createdAt: t.expose('createdAt', { type: 'Date' }),
        content: t.exposeString('content'),
        paymentIntent: t.exposeString('paymentIntent', { nullable: true }),
        paymentStatus: t.exposeInt('pyamentStatus'),

        form: t.relation('form'),
        user: t.relation('user')
    })
})
