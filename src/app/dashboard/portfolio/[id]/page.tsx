import { notFound } from 'next/navigation'

import { api } from '~/trpc/server'
import { UpdateForm } from '../form'

export default async function PortfolioImagePage(props: {
    params: Promise<{ id: string }>
}) {
    const params = await props.params
    const portfolioItem = await api.portfolio.getPortfolioById({
        id: params.id
    })

    if (!portfolioItem) {
        return notFound()
    }

    return (
        <div className="container mx-auto max-w-xl">
            <UpdateForm portfolio={portfolioItem} />
        </div>
    )
}
