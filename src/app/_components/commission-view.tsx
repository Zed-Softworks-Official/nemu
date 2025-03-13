'use client'

import Link from 'next/link'
import { useState } from 'react'
import { type InferSelectModel } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { ClipboardListIcon } from 'lucide-react'
import { RedirectToSignIn, useUser } from '@clerk/nextjs'

import { api } from '~/trpc/react'
import { type forms } from '~/server/db/schema'
import { getAvailabilityBadgeData } from '~/lib/utils'
import { type ChargeMethod, type ClientCommissionItem } from '~/lib/types'

import Loading from '~/app/_components/ui/loading'
import ImageViewer from '~/app/_components/ui/image-viewer'

import { RequestForm } from '~/app/_components/form-builder/request-form'
import { Badge } from '~/app/_components/ui/badge'
import { Checkbox } from '~/app/_components/ui/checkbox'
import { Separator } from '~/app/_components/ui/separator'
import {
    Accordion,
    AccordionContent,
    AccordionTrigger,
    AccordionItem
} from '~/app/_components/ui/accordion'
import { Button } from '~/app/_components/ui/button'
import Price from '~/app/_components/ui/price'
import ShareButton from '~/app/_components/ui/share-button'
import { MarkdownEditor } from './ui/markdown-editor'

export function CommissionView(props: { handle: string; slug: string }) {
    const { data: commission, isLoading } = api.commission.getCommission.useQuery({
        handle: props.handle,
        slug: props.slug
    })

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loading />
            </div>
        )
    }

    if (!commission?.form) {
        return notFound()
    }

    return (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <ImageViewer images={commission.images} />
            <div className="bg-background col-span-2 h-full overflow-y-auto rounded-xl shadow-xl">
                <CommissionContent
                    commission={commission}
                    form_data={commission.form}
                    user_requested={false}
                />
            </div>
        </div>
    )
}

function CommissionContent(props: {
    commission: ClientCommissionItem
    form_data: InferSelectModel<typeof forms>
    user_requested: boolean | undefined
}) {
    const { user } = useUser()

    const [showForm, setShowForm] = useState(false)
    const [acceptedTerms, setAcceptedTerms] = useState(false)

    const [variant, text] = getAvailabilityBadgeData(props.commission.availability)

    if (showForm && props.user_requested !== undefined && props.commission.id) {
        if (!user) {
            return <RedirectToSignIn />
        }

        return (
            <div className="flex h-full max-h-fit flex-1 grow-0 overflow-y-auto">
                <RequestForm
                    commission_id={props.commission.id}
                    set_show_form={setShowForm}
                    form_data={props.form_data}
                    user_requested={props.user_requested}
                />
            </div>
        )
    }

    return (
        <div className="flex h-full max-h-fit w-full flex-1 grow-0 overflow-y-auto">
            <div className="flex w-full flex-col gap-5 p-5">
                <div className="flex flex-row justify-between">
                    <div>
                        <h2 className="flex items-center gap-2 text-2xl font-bold">
                            {props.commission?.title}
                            <Badge variant={variant} className="badge-lg">
                                {text}
                            </Badge>
                        </h2>
                        <p className="text-muted-foreground mb-4">
                            By
                            <Button
                                variant={'link'}
                                asChild
                                className="text-muted-foreground hover:text-foreground ml-0 pl-2"
                            >
                                <Link
                                    prefetch={true}
                                    replace={true}
                                    href={`/@${props.commission.artist?.handle}`}
                                >
                                    @{props.commission.artist?.handle}
                                </Link>
                            </Button>
                        </p>
                    </div>
                    <ShareButton />
                </div>
                <Separator />
                <div className="h-full w-full">
                    <MarkdownEditor content={props.commission.description} disabled />
                </div>
                <Separator />
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="terms">
                        <AccordionTrigger>Terms & Conditions</AccordionTrigger>
                        <AccordionContent>
                            {props.commission.artist?.terms}
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
                    <label htmlFor="accept_terms">Accept Terms & Conditions</label>
                </div>
                <Separator />
                <div className="flex w-full flex-col items-end gap-5">
                    <div className="flex w-full items-center justify-between">
                        <div className="flex flex-col items-start gap-1">
                            <Price value={props.commission.price} />
                            <CommissionChargeMethod
                                chargeMethod={props.commission.chargeMethod}
                            />
                        </div>
                        <Button
                            size={'lg'}
                            onMouseDown={() => {
                                setShowForm(true)
                            }}
                            disabled={
                                !acceptedTerms ||
                                props.user_requested === undefined ||
                                props.user_requested ||
                                props.commission.availability === 'closed'
                            }
                        >
                            <ClipboardListIcon className="h-6 w-6" />
                            Commission
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function CommissionChargeMethod(props: { chargeMethod: ChargeMethod }) {
    if (props.chargeMethod === 'in_full') {
        return <span className="text-muted-foreground text-sm italic">Pay In Full</span>
    }

    if (props.chargeMethod === 'down_payment') {
        return (
            <span className="text-muted-foreground text-sm italic">
                Down Payment Required
            </span>
        )
    }

    return <p>Unknown</p>
}
