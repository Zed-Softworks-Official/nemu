'use client'

import { PortfolioResponse } from '@/core/responses'
import NemuImage from '../nemu-image'
import useSWR from 'swr'
import { GraphQLFetcher } from '@/core/helpers'
import ContentLoadError from '../content-load-error'

export default function Portfolio({ artist_id }: { artist_id: string }) {
    const { data, isLoading, error } = useSWR(
        `{
            artist(id: "${artist_id}") {
                portfolio_items {
                    signed_url
                    name
                }
            }
        }`,
        GraphQLFetcher
    )

    if (isLoading) {
        return null
    }

    if (error) {
        return <ContentLoadError />
    }

    return (
        <div className="flex flex-wrap gap-5 flex-1 flex-grow">
            {(data as PortfolioResponse).artist?.portfolio_items.map((item) => {
                return (
                    <div
                        key={item.name}
                        className="bg-base-100 w-fit h-fit rounded-xl animate-pop-in transition-all duration-200"
                    >
                        <NemuImage
                            src={item.signed_url}
                            alt={item.name}
                            width={300}
                            height={300}
                            className="rounded-xl w-full h-fit max-w-xs"
                        />
                    </div>
                )
            })}
        </div>
    )
}
