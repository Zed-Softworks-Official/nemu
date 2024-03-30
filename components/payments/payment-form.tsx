'use client'

import { Transition } from '@headlessui/react'
import { Appearance, loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { useMemo, useState } from 'react'
import { StripeGetClientSecretInput } from '@/core/structures'
import CommissionCheckoutForm from './commission-checkout-form'
import Loading from '../loading'
import { api } from '@/core/trpc/react'

export default function PaymentForm({
    submitted,
    checkout_data
}: {
    submitted: boolean
    checkout_data: StripeGetClientSecretInput
}) {
    const stripePromise = useMemo(
        () =>
            loadStripe(
                'pk_test_51NBSJ1BUuzvTmMJLd6WdDax5MPbpyO0MOl4EvBc9WwnEk9vUvxuN9lavCkH5YvdhJxF7QMxa04lIe2qiAx5cA7s600fo7oHS8d',
                {
                    stripeAccount: checkout_data.stripe_account
                }
            ),
        [checkout_data]
    )

    const { data, isLoading } = api.stripe.get_client_secret.useQuery(checkout_data, {
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        onSuccess: (res) => {
            setClientSecret(res.client_secret)
        }
    })
    const [clientSecret, setClientSecret] = useState(data?.client_secret)

    const appearance: Appearance = {
        theme: 'flat',
        variables: {
            colorPrimaryText: '#2185d5',
            colorText: '#ffffff',
            colorBackground: '#333',
            gridRowSpacing: '1rem'
        }
    }

    if (isLoading) {
        return <Loading />
    }

    return (
        <Transition as="div" show={submitted}>
            <div className="card bg-base-300 shadow-xl rounded-xl max-w-md mx-auto">
                <div className="card-body">
                    {clientSecret && stripePromise ? (
                        <Elements
                            stripe={stripePromise}
                            options={{ clientSecret, appearance: appearance }}
                        >
                            <CommissionCheckoutForm />
                        </Elements>
                    ) : (
                        <Loading />
                    )}
                </div>
            </div>
        </Transition>
    )
}
