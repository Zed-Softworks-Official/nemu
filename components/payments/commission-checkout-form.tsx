'use client'

import {
    ExpressCheckoutElement,
    LinkAuthenticationElement,
    PaymentElement,
    useElements,
    useStripe
} from '@stripe/react-stripe-js'
import { FormEvent, useState } from 'react'
import { useSession } from 'next-auth/react'
import Loading from '../loading'
import { XCircleIcon } from 'lucide-react'

export default function CommissionCheckoutForm() {
    const { data: session, status } = useSession()
    const stripe = useStripe()
    const elements = useElements()
    const [message, setMessage] = useState<string | undefined>('')
    const [isLoading, setIsLoading] = useState(false)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (!stripe || !elements) {
            // Stripe.js has not loaded yet.
            return
        }

        setIsLoading(true)

        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/payments/commission`
            }
        })

        // Note: This point will only be reached if there is an immediate error when
        // confirming the payment. Otherwise, your customer will be redirected to the
        // return_url.
        if (error.type === 'card_error' || error.type === 'validation_error') {
            setMessage(error.message)
        } else {
            setMessage('An unexpected error has occured')
        }

        setIsLoading(false)
    }

    if (status === 'loading') {
        return <Loading />
    }

    return (
        <form id="payment-form" className="flex flex-col gap-5" onSubmit={handleSubmit}>
            {message && (
                <div className="alert alert-error">
                    <XCircleIcon className="w-6 h-6" />
                    <span>{message}</span>
                </div>
            )}
            <LinkAuthenticationElement
                id="link-authentication-element"
                options={{ defaultValues: { email: session?.user.email || '' } }}
            />
            <div className="divider"></div>
            <ExpressCheckoutElement
                id="express-payment-element"
                onConfirm={() => console.log('hello, world')}
            />
            <div className="divider">OR</div>
            <PaymentElement id="payment-element" />
            <button
                id="submit"
                className="btn btn-primary"
                disabled={isLoading || !stripe || !elements}
            >
                {isLoading && <span className="loading loading-spinner"></span>}
                Buy Now
            </button>
        </form>
    )
}
