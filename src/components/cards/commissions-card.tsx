import Link from 'next/link'
import { EyeIcon } from 'lucide-react'

import { api } from '~/trpc/server'
import { format_to_currency } from '~/lib/utils'

import NemuImage from '~/components/nemu-image'

export default async function CommissionsCard({
    artist_id,
    handle
}: {
    artist_id: string
    handle: string
}) {
    const data = await api.commission.get_commission_list({ artist_id })

    if (!data) {
        return <></>
    }

    return (
        <div className="grid grid-cols-1 gap-5 w-full">
            {data.map((commission) => (
                <div className="card lg:card-side bg-base-100 shadow-xl transition-all duration-200 ease-in-out animate-pop-in">
                    <figure>
                        <NemuImage
                            src={commission.images[0]!.url}
                            placeholder="blur"
                            blurDataURL={commission.images[0]!.blur_data}
                            alt="Featured Image"
                            width={400}
                            height={400}
                            className="w-full h-full"
                        />
                    </figure>
                    <div className="card-body h-full">
                        <h2 className="text-3xl font-bold">{commission.title}</h2>
                        <div className="divider"></div>
                        <p>{commission.description}</p>
                        <div className="flex items-end justify-between">
                            <div className="flex flex-col">
                                <span className="uppercase text-sm text-base-content/60">
                                    From
                                </span>
                                <span className="text-2xl font-bold">
                                    {format_to_currency(commission.price!)}
                                </span>
                            </div>
                            <Link
                                className="btn btn-primary text-white"
                                href={`/@${handle}/commission/${commission.slug}`}
                            >
                                <EyeIcon className="w-6 h-6" />
                                View
                            </Link>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
