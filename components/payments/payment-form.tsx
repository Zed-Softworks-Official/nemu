'use client'

import { Transition } from '@headlessui/react'
import { Appearance, loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { useEffect, useMemo, useState } from 'react'
import { CheckoutType, StripeCommissionCheckoutData, StripeProductCheckoutData } from '@/core/structures'
import CommissionCheckoutForm from './commission-checkout-form'
import Loading from '../loading'

export default function PaymentForm({
    submitted,
    checkout_data,
    form_type
}: {
    submitted: boolean
    checkout_data: StripeCommissionCheckoutData | StripeProductCheckoutData
    form_type: 'commission' | 'product'
}) {
    const stripePromise = useMemo(() => {
        return loadStripe('pk_test_51NBSJ1BUuzvTmMJLd6WdDax5MPbpyO0MOl4EvBc9WwnEk9vUvxuN9lavCkH5YvdhJxF7QMxa04lIe2qiAx5cA7s600fo7oHS8d', {
            stripeAccount: checkout_data.stripe_account
        })
    }, [checkout_data])

    const [clientSecret, setClientSecret] = useState('')

    const appearance: Appearance = {
        theme: 'flat',
        variables: {
            colorPrimaryText: '#2185d5',
            colorText: '#ffffff',
            colorBackground: '#333',
            gridRowSpacing: '1rem'
        }
    }

    useEffect(() => {
        if (checkout_data.checkout_type == CheckoutType.Commission) {
            fetch(`/api/stripe/commission`, {
                method: 'post',
                body: JSON.stringify({
                    checkout_data
                })
            })
                .then((res) => res.json())
                .then((data) => setClientSecret(data.clientSecret))
        } else {
            fetch(`/api/stripe/product`, {
                method: 'post',
                body: JSON.stringify({
                    checkout_data
                })
            })
                .then((res) => res.json())
                .then((data) => setClientSecret(data.clientSecret))
        }
    }, [checkout_data])

    return (
        <Transition as="div" show={submitted}>
            <div className="card bg-base-300 shadow-xl rounded-xl max-w-md mx-auto">
                <div className="card-body">
                    {clientSecret && stripePromise ? (
                        <Elements stripe={stripePromise} options={{ clientSecret, appearance: appearance }}>
                            <CommissionCheckoutForm form_type={form_type} />
                        </Elements>
                    ) : (
                        <Loading />
                    )}
                </div>
            </div>
        </Transition>
    )
}
