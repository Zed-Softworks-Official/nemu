import Link from 'next/link'
import { Share2Icon } from 'lucide-react'

import { NemuImageData, RouterOutput } from '~/core/structures'
import ImageViewer from '~/components/ui/image-viewer'
import { Button } from '~/components/ui/button'

export default function CommissionDisplay({
    commission
}: {
    commission: RouterOutput['commission']['get_commission']
}) {
    return (
        <div className="grid md:grid-cols-3 grid-cols-1 gap-5 scrollbar-none">
            <ImageViewer images={commission?.images as NemuImageData[]} />
            <div className="card bg-base-100 shadow-xl col-span-2">
                <div className="card-body">
                    <div className="flex flex-row justify-between">
                        <div>
                            <h2 className="text-2xl">
                                {commission?.title}
                            </h2>
                            <p className="text-base-content/60">
                                By{' '}
                                <Link href={`/@${commission?.artist?.handle}`} className="link link-hover">
                                    @{commission?.artist?.handle}
                                </Link>
                            </p>
                        </div>
                        <Button variant={'outline'}>
                            <Share2Icon className="w-6 h-6" />
                            Share
                        </Button>
                    </div>
                    <div className="divider"></div>
                    <div>{commission?.description}</div>
                    <div className="divider">Terms & Conditions</div>
                    <p>{commission?.artist?.terms}</p>
                </div>
            </div>
        </div>
    )
}
