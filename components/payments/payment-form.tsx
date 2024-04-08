'use client'

import { Transition } from '@headlessui/react'
import { Appearance, loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { useMemo } from 'react'
import CommissionCheckoutForm from './commission-checkout-form'

export default function PaymentForm({
    stripe_account,
    client_secret
}: {
    stripe_account: string
    client_secret: string
}) {
    const stripePromise = useMemo(
        () =>
            loadStripe(
                'pk_test_51NBSJ1BUuzvTmMJLd6WdDax5MPbpyO0MOl4EvBc9WwnEk9vUvxuN9lavCkH5YvdhJxF7QMxa04lIe2qiAx5cA7s600fo7oHS8d',
                {
                    stripeAccount: stripe_account
                }
            ),
        [stripe_account]
    )

    const appearance: Appearance = {
        theme: 'flat',
        variables: {
            colorPrimaryText: '#2185d5',
            colorText: '#ffffff',
            colorBackground: '#333',
            gridRowSpacing: '1rem'
        }
    }

    return (
        <div className="card bg-base-300 shadow-xl rounded-xl max-w-md mx-auto">
            <div className="card-body">
                <Elements
                    stripe={stripePromise}
                    options={{ clientSecret: client_secret, appearance: appearance }}
                >
                    <CommissionCheckoutForm />
                </Elements>
            </div>
        </div>
    )
}
