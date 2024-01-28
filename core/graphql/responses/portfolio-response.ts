import { builder } from '../builder'
import { PortfolioResponse } from '@/core/responses'

export const PortfolioGraphQLResponse = builder
    .objectRef<PortfolioResponse>('PortfolioResponse')
    .implement({
        fields: (t) => ({
            status: t.exposeInt('status'),
            message: t.exposeString('message', { nullable: true })
        })
    })
