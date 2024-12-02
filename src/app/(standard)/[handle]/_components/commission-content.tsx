'use client'

import Link from 'next/link'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '~/components/ui/accordion'
import { Badge } from '~/components/ui/badge'
import ShareButton from '~/components/ui/share-button'
import Price from '~/components/ui/price'
import { Checkbox } from '~/components/ui/checkbox'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { ClipboardListIcon } from 'lucide-react'
import type { InferSelectModel } from 'drizzle-orm'
import type { ClientCommissionItem } from '~/core/structures'
import type { forms } from '~/server/db/schema'
import { get_availability_badge_data } from '~/lib/utils'
import { RequestForm } from '~/components/form-builder/request-form'

export default function CommissionContent(props: {
    commission: ClientCommissionItem
    form_data: InferSelectModel<typeof forms>
    user_requested: boolean | undefined
}) {
    const [showForm, setShowForm] = useState(false)
    const [acceptedTerms, setAcceptedTerms] = useState(false)

    const [variant, text] = get_availability_badge_data(props.commission.availability)

    if (showForm && props.user_requested !== undefined && props.commission.id) {
        return (
            <RequestForm
                commission_id={props.commission.id}
                form_data={props.form_data}
                user_requested={props.user_requested}
            />
        )
    }

    return (
        <>
            <div className="flex flex-col gap-5 p-5">
                <div className="flex flex-row justify-between">
                    <div>
                        <h2 className="flex items-center gap-2 text-2xl font-bold">
                            {props.commission?.title}
                            <Badge variant={variant} className="badge-lg">
                                {text}
                            </Badge>
                        </h2>
                        <p className="text-base-content/60 mb-4">
                            By{' '}
                            <Link
                                href={`/@${props.commission.artist?.handle}`}
                                className="link-hover link"
                            >
                                @{props.commission.artist?.handle}
                            </Link>
                        </p>
                    </div>
                    <ShareButton />
                </div>
                <div className="divider"></div>
                <div className="h-full">
                    <p>{props.commission.description}</p>
                </div>
                <div className="divider"></div>
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="item-1">
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
                    <label htmlFor="accept_terms" className="label">
                        Accept Terms & Conditions
                    </label>
                </div>
                <div className="divider"></div>
                <div className="flex w-full flex-col items-end gap-5">
                    <div className="flex w-full justify-between">
                        <Price value={props.commission.price} />
                        <Button
                            size={'lg'}
                            onMouseDown={() => {
                                setShowForm(true)
                            }}
                            disabled={
                                !acceptedTerms ||
                                props.user_requested === undefined ||
                                props.user_requested
                            }
                        >
                            <ClipboardListIcon className="h-6 w-6" />
                            Commission
                        </Button>
                    </div>
                </div>
            </div>
        </>
    )
}
