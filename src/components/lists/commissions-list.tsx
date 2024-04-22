import Link from 'next/link'
import { EyeIcon } from 'lucide-react'

import { api } from '~/trpc/server'
import { get_availability_badge_data } from '~/lib/utils'

import NemuImage from '~/components/nemu-image'
import { Badge } from '~/components/ui/badge'
import Price from '~/components/ui/price'

export default async function CommissionsList({
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
            {data.map((commission) => {
                const [variant, text] = get_availability_badge_data(
                    commission.availability
                )

                return (
                    <div
                        key={commission.slug}
                        className="card lg:card-side bg-base-100 shadow-xl transition-all duration-200 ease-in-out animate-pop-in"
                    >
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
                            <h2 className="text-3xl font-bold flex items-center gap-2">
                                {commission.title}
                                <Badge variant={variant}>{text}</Badge>
                            </h2>
                            <div className="divider"></div>
                            <p>{commission.description}</p>
                            <div className="flex items-end justify-between">
                                <Price value={commission.price} />
                                <Link
                                    className="btn btn-primary text-white"
                                    href={`/@${handle}/commission/${commission.slug}`}
                                    scroll={false}
                                >
                                    <EyeIcon className="w-6 h-6" />
                                    View
                                </Link>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
