'use client'

import Link from 'next/link'

import { NemuImageData, RouterOutput } from '~/core/structures'
import ImageViewer from '~/components/ui/image-viewer'
import RatingView from '~/components/ui/rating-view'

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '~/components/ui/accordion'

import ShareButton from '~/components/ui/share-button'
import { get_availability_badge_data } from '~/lib/utils'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { ClipboardListIcon, ShoppingCartIcon } from 'lucide-react'
import Price from '~/components/ui/price'
import { Checkbox } from '~/components/ui/checkbox'
import { useState } from 'react'
import { Session } from 'next-auth'
import { notFound, useRouter } from 'next/navigation'

import RequestSubmitForm from '~/components/form-builder/requests/request-form'

export default function CommissionDisplay({
    commission,
    session
}: {
    commission: RouterOutput['commission']['get_commission']
    session: Session | null
}) {
    const [showForm, setShowForm] = useState(false)
    const [acceptedTerms, setAcceptedTerms] = useState(false)

    const { push } = useRouter()

    // If we can't find the form then wtf
    if (!commission) {
        return notFound()
    }

    const [variant, text] = get_availability_badge_data(commission?.availability!)

    return (
        <div className="grid md:grid-cols-3 grid-cols-1 gap-5 scrollbar-none">
            <ImageViewer images={commission?.images as NemuImageData[]} />
            <div className="card bg-base-100 shadow-xl col-span-2">
                {showForm ? (
                    <RequestSubmitForm
                        setShowForm={setShowForm}
                        commission_id={commission.id!}
                        form_id={commission.form_id!}
                    />
                ) : (
                    <div className="card-body">
                        <div className="flex flex-row justify-between">
                            <div>
                                <h2 className="text-2xl font-bold flex items-center gap-2">
                                    {commission?.title}
                                    <Badge variant={variant} className='badge-lg'>{text}</Badge>
                                </h2>
                                <p className="text-base-content/60 mb-4">
                                    By{' '}
                                    <Link
                                        href={`/@${commission?.artist?.handle}`}
                                        className="link link-hover"
                                    >
                                        @{commission?.artist?.handle}
                                    </Link>
                                </p>
                                <div className="flex items-center gap-2">
                                    <RatingView rating={commission?.rating!} />
                                    <span className="text-base-content/60 text-sm">
                                        ({commission.rating.toPrecision(2)})
                                    </span>
                                </div>
                            </div>
                            <ShareButton />
                        </div>
                        <div className="divider"></div>
                        <div className="h-full">
                            <p>{commission?.description}</p>
                        </div>
                        <div className="divider"></div>
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="item-1">
                                <AccordionTrigger>Terms & Conditions</AccordionTrigger>
                                <AccordionContent>
                                    {commission?.artist?.terms}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="accept_terms"
                                defaultChecked={acceptedTerms}
                                onCheckedChange={(checked) =>
                                    setAcceptedTerms(checked as boolean)
                                }
                            />
                            <label htmlFor="accept_terms" className="label">
                                Accept Terms & Conditions
                            </label>
                        </div>
                        <div className="divider"></div>
                        <div className="flex flex-col items-end gap-5 w-full">
                            <div className="flex justify-between w-full">
                                <Price value={commission.price} />
                                <Button
                                    className="btn-wide"
                                    onClick={() => {
                                        if (!session) {
                                            return push('/u/login')
                                        }

                                        setShowForm(true)
                                    }}
                                    disabled={!acceptedTerms}
                                >
                                    <ClipboardListIcon className="w-6 h-6" />
                                    Commission
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
