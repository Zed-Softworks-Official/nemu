import DashboardContainer from '~/components/ui/dashboard-container'


import Link from 'next/link'
import { EyeIcon, PencilIcon } from 'lucide-react'
import { getServerAuthSession } from '~/server/auth'
import { api } from '~/trpc/server'
import NemuImage from '~/components/nemu-image'

export default async function CommissionsDashboardPage() {
    const session = await getServerAuthSession()
    const commissions = await api.commission.get_commission_list({
        artist_id: session?.user.artist_id
    })

    return (
        <DashboardContainer title="Commissions" addButtonUrl="/dashboard/commissions/create">
            <div className="grid grid-cols-3 gap-5">
                {commissions?.map((commission) => (
                    <div
                        key={commission.title}
                        className="card bg-base-100 shadow-xl animate-pop-in duration-150 transition-all"
                    >
                        <figure>
                            <NemuImage
                                src={commission.images[0]?.url!}
                                placeholder="blur"
                                blurDataURL={commission.images[0]?.blur_data}
                                alt={`${commission.title} Featured Image`}
                                width={200}
                                height={200}
                                className="w-full"
                            />
                        </figure>
                        <div className="card-body">
                            <h2 className="card-title">{commission.title}</h2>
                            <div className="flex items-center justify-start gap-5">
                                {/* {ConvertAvailabilityToBadge(commission.availability!)}
                                {ConvertPublishedToBadge(commission.published!)} */}
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