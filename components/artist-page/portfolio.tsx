'use client'

import { PortfolioResponse } from '@/core/responses'
import { PortfolioItem } from '@/core/structures'
import NemuImage from '../nemu-image'
import useSWR from 'swr'
import { GraphQLFetcher } from '@/core/helpers'
import ContentLoadError from '../content-load-error'

export default function Portfolio({ artist_id }: { artist_id: string }) {
    const { data, isLoading, error } = useSWR(
        `{
        artist(id: "${artist_id}") {
          portfolioItems {
            name
            image
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {(data as PortfolioResponse).artist.portfolioItems.map((item) => {
                return (
                    <div
                        key={item.name}
                        className="bg-base-100 w-fit h-fit rounded-xl animate-pop-in transition-all duration-200"
                    >
                        <NemuImage
                            src={item.image}
                            alt={item.name}
                            width={300}
                            height={300}
                            className="rounded-xl w-full"
                        />
                    </div>
                )
            })}
        </div>
    )
}
