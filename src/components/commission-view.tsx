'use client'

import Link from 'next/link'
import { useState } from 'react'
import { type InferSelectModel } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { ClipboardListIcon } from 'lucide-react'
import { RedirectToSignIn, useUser } from '@clerk/nextjs'

import { api } from '~/trpc/react'
import { type forms } from '~/server/db/schema'
import { get_availability_badge_data } from '~/lib/utils'
import { type ChargeMethod, type ClientCommissionItem } from '~/lib/structures'

import Loading from '~/components/ui/loading'
import ImageViewer from '~/components/ui/image-viewer'

import { RequestForm } from '~/components/form-builder/request-form'
import { Badge } from '~/components/ui/badge'
import { Checkbox } from '~/components/ui/checkbox'
import { Separator } from '~/components/ui/separator'
import {
    Accordion,
    AccordionContent,
    AccordionTrigger,
    AccordionItem
} from '~/components/ui/accordion'
import { Button } from '~/components/ui/button'
import Price from '~/components/ui/price'
import ShareButton from '~/components/ui/share-button'

export function CommissionView(props: { handle: string; slug: string }) {
    const { data: commission, isLoading } = api.commission.get_commission.useQuery({
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
            <div className="col-span-2 h-full overflow-y-auto rounded-xl bg-background shadow-xl">
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

    const [variant, text] = get_availability_badge_data(props.commission.availability)

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
        <div className="flex h-full max-h-fit flex-1 grow-0 overflow-y-auto">
            <div className="flex flex-col gap-5 p-5">
                <div className="flex flex-row justify-between">
                    <div>
                        <h2 className="flex items-center gap-2 text-2xl font-bold">
                            {props.commission?.title}
                            <Badge variant={variant} className="badge-lg">
                                {text}
                            </Badge>
                        </h2>
                        <p className="mb-4 text-muted-foreground">
                            By
                            <Button
                                variant={'link'}
                                asChild
                                className="ml-0 pl-2 text-muted-foreground hover:text-foreground"
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
                <div className="h-full">
                    <p>{props.commission.description}</p>
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
                                charge_method={props.commission.charge_method}
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

function CommissionChargeMethod(props: { charge_method: ChargeMethod }) {
    if (props.charge_method === 'in_full') {
        return <span className="text-sm italic text-muted-foreground">Pay In Full</span>
    }

    if (props.charge_method === 'down_payment') {
        return (
            <span className="text-sm italic text-muted-foreground">
                Down Payment Required
            </span>
        )
    }

    return <p>Unknown</p>
}
