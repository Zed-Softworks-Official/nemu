import { NemuResponse } from '../responses'
import { builder } from './builder'

export const NemuGraphQLResponse = builder
    .objectRef<NemuResponse>('NemuResponse')
    .implement({
        fields: (t) => ({
            status: t.exposeInt('status'),
            message: t.exposeString('message', { nullable: true })
        })
    })
