'use client'

import Loading from '@/components/loading'
import { GraphQLFetcher } from '@/core/helpers'
import useSWR from 'swr'
import NemuImage from '@/components/nemu-image'
import { ConvertAvailabilityToBadge } from '@/core/react-helpers'
import { EyeIcon, PencilIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { CommissionItem } from '@/core/structures'

export default function DashboardCommissions() {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
            artist(id: "${artistId}") {
                commissions {
                    title
                    description
                    price
                    featured_image
                    availability
                    slug
                }
            }
        }`,
        GraphQLFetcher<{ artist: { commissions: CommissionItem[] } }>
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <main className="flex justify-evenly gap-5 flex-wrap">
            {data?.artist.commissions?.map((commission) => (
                <div
                    key={commission.title}
                    className="card lg:card-side bg-base-100 shadow-xl animate-pop-in transition-all duration-200"
                >
                    <figure>
                        <NemuImage
                            src={commission.featured_image!}
                            alt={`${commission.title} Featured Image`}
                            width={200}
                            height={200}
                        />
                    </figure>
                    <div className="card-body max-h-full">
                        <h2 className="card-title">{commission.title}</h2>
                        {ConvertAvailabilityToBadge(commission.availability!)}
                        <div className="flex justify-end items-end h-full">
                            <div className="card-actions justify-end">
                                <Link
                                    href={`/dashboard/commissions/${commission.slug}`}
                                    className="btn btn-outline btn-accent"
                                >
                                    <EyeIcon className="w-6 h-6" />
                                    View
                                </Link>
                                <Link
                                    href={`/dashboard/commissions/${commission.slug}/edit`}
                                    className="btn btn-primary"
                                >
                                    <PencilIcon className="w-6 h-6" />
                                    Edit
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </main>
    )
}
