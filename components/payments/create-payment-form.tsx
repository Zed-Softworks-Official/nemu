'use client'

import { StripeGetClientSecretInput } from '@/core/structures'
import { api } from '@/core/trpc/react'
import Loading from '../loading'
import PaymentForm from './payment-form'

export default function CreatePaymentForm({
    checkout_data
}: {
    checkout_data: StripeGetClientSecretInput
}) {
    const { data, isLoading } = api.stripe.get_client_secret.useQuery(checkout_data, {
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false
    })

    if (isLoading) {
        return <Loading />
    }

    return (
        <PaymentForm
            stripe_account={checkout_data.stripe_account}
            client_secret={data?.client_secret!}
        />
    )
}
