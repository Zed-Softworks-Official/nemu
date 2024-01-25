import { builder } from '../builder'

builder.prismaObject('FormSubmission', {
    fields: (t) => ({
        id: t.exposeString('id'),
        formId: t.exposeString('formId'),
        userId: t.exposeString('userId'),
        createAt: t.expose('createdAt', { type: 'Date' }),

        form: t.relation('form'),
        user: t.relation('user')
    })
})
