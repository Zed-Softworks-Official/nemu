import { builder } from '../builder'

builder.prismaObject('InvoiceItem', {
    fields: (t) => ({
        id: t.exposeString('id'),
        invoiceId: t.exposeString('invoiceId'),

        name: t.exposeString('name'),
        price: t.exposeFloat('price'),
        quantity: t.exposeInt('quantity'),

        createdAt: t.expose('createdAt', { type: 'Date' }),

        invoice: t.relation('invoice')
    })
})
