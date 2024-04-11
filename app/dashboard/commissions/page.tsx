import DashboardContainer from '@/components/dashboard/dashboard-container'
import { getServerAuthSession } from '@/core/auth'
import { api } from '@/core/api/server'
import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'

import NemuImage from '@/components/nemu-image'
import { ConvertAvailabilityToBadge, ConvertPublishedToBadge } from '@/core/react-helpers'

import Link from 'next/link'
import { EyeIcon, PencilIcon } from 'lucide-react'

export default async function CommissionsPage() {
    const session = await getServerAuthSession()
    const commissions = await api.commissions.get_commissions({
        artist_id: session?.user.artist_id
    })

    return (
        <DashboardContainer title="Commissions" addButtonUrl="/dashboard/commissions/add">
            <div className="grid grid-cols-3 gap-5">
                {commissions?.map((commission) => (
                    <div
                        key={commission.title}
                        className="card bg-base-100 shadow-xl animate-pop-in duration-150 transition-all"
                    >
                        <figure>
                            <NemuImage
                                src={commission.featured_image?.signed_url!}
                                placeholder="blur"
                                blurDataURL={commission.featured_image?.blur_data}
                                alt={`${commission.title} Featured Image`}
                                width={200}
                                height={200}
                                className="w-full"
                            />
                        </figure>
                        <div className="card-body">
                            <h2 className="card-title">{commission.title}</h2>
                            <div className="flex items-center justify-start gap-5">
                                {ConvertAvailabilityToBadge(commission.availability!)}
                                {ConvertPublishedToBadge(commission.published!)}
                            </div>
                            <div className="flex justify-between h-full mt-10">
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
                ))}
            </div>
        </DashboardContainer>
    )
}
