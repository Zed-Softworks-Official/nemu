import Link from 'next/link'
import { Share2Icon } from 'lucide-react'

import { NemuImageData, RouterOutput } from '~/core/structures'
import ImageViewer from '~/components/ui/image-viewer'
import { Button } from '~/components/ui/button'
import RatingView from '~/components/ui/rating-view'

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from "~/components/ui/accordion"

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
                            <h2 className="text-2xl">{commission?.title}</h2>
                            <p className="text-base-content/60 mb-4">
                                By{' '}
                                <Link
                                    href={`/@${commission?.artist?.handle}`}
                                    className="link link-hover"
                                >
                                    @{commission?.artist?.handle}
                                </Link>
                            </p>
                            <RatingView rating={commission?.rating!} />
                        </div>
                        <Button variant={'outline'}>
                            <Share2Icon className="w-6 h-6" />
                            Share
                        </Button>
                    </div>
                    <div className="divider"></div>
                    <div className="h-full">
                        <p>{commission?.description}</p>
                        <div className="flex items-end"></div>
                    </div>
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="item-1">
                            <AccordionTrigger>Terms & Conditions</AccordionTrigger>
                            <AccordionContent>
                                {commission?.artist?.terms}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </div>
        </div>
    )
}
