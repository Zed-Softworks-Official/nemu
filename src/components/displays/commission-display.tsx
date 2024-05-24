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
import { notFound, useRouter } from 'next/navigation'

import RequestSubmitForm from '~/components/form-builder/requests/request-form'
import { useUser } from '@clerk/nextjs'

export default function CommissionDisplay({
    commission
}: {
    commission: RouterOutput['commission']['get_commission']
}) {
    const [showForm, setShowForm] = useState(false)
    const [acceptedTerms, setAcceptedTerms] = useState(false)

    const { push } = useRouter()
    const { user, isLoaded } = useUser()

    // If we can't find the form then wtf
    if (!commission) {
        return notFound()
    }

    const [variant, text] = get_availability_badge_data(commission?.availability!)

    if (!isLoaded) {
        return null
    }

    return (
        <div className="scrollbar-none grid grid-cols-1 gap-5 md:grid-cols-3">
            <ImageViewer images={commission?.images as NemuImageData[]} />
            <div className="card col-span-2 bg-base-100 shadow-xl">
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
                                <h2 className="flex items-center gap-2 text-2xl font-bold">
                                    {commission?.title}
                                    <Badge variant={variant} className="badge-lg">
                                        {text}
                                    </Badge>
                                </h2>
                                <p className="mb-4 text-base-content/60">
                                    By{' '}
                                    <Link
                                        href={`/@${commission?.artist?.handle}`}
                                        className="link-hover link"
                                    >
                                        @{commission?.artist?.handle}
                                    </Link>
                                </p>
                                <div className="flex items-center gap-2">
                                    <RatingView rating={commission?.rating!} />
                                    <span className="text-sm text-base-content/60">
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
                        <div className="flex w-full flex-col items-end gap-5">
                            <div className="flex w-full justify-between">
                                <Price value={commission.price} />
                                <Button
                                    className="btn-wide"
                                    onMouseDown={() => {
                                        if (!user || !isLoaded) {
                                            return push('/u/login')
                                        }

                                        setShowForm(true)
                                    }}
                                    disabled={!acceptedTerms}
                                >
                                    <ClipboardListIcon className="h-6 w-6" />
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
