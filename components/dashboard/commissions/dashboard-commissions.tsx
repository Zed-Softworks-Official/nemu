'use client'

import Loading from '@/components/loading'
import NemuImage from '@/components/nemu-image'
import { ConvertAvailabilityToBadge, ConvertPublishedToBadge } from '@/core/react-helpers'
import Link from 'next/link'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'
import { api } from '@/core/trpc/react'
import { EyeIcon, PencilIcon } from 'lucide-react'

export default function DashboardCommissions() {
    const { artist } = useDashboardContext()!
    const { data, isLoading, isError, error } = api.commissions.get_commissions.useQuery({
        artist_id: artist?.id!
    })

    if (isLoading) {
        return <Loading />
    }

    return (
        <ResponsiveMasonry columnsCountBreakPoints={{ 350: 1, 900: 2, 1024: 3, 1280: 4 }}>
            <Masonry gutter="3rem">
                {data?.map((commission) => (
                    <div
                        key={commission.title}
                        className="card bg-base-100 shadow-xl animate-pop-in transition-all duration-200"
                    >
                        <figure>
                            <NemuImage
                                src={commission.featured_image?.signed_url!}
                                placeholder="blur"
                                blurDataURL={commission.featured_image?.blur_data}
                                alt={`${commission.title} Featured Image`}
                                width={450}
                                height={450}
                                className="w-full"
                            />
                        </figure>
                        <div className="card-body max-h-full">
                            <h2 className="card-title">{commission.title}</h2>
                            <div className="flex items-center justify-start gap-5">
                                {ConvertAvailabilityToBadge(commission.availability!)}
                                {ConvertPublishedToBadge(commission.published!)}
                            </div>
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
            </Masonry>
        </ResponsiveMasonry>
    )
}
