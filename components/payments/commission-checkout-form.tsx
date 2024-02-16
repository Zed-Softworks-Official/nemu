'use client'

import { ExpressCheckoutElement, LinkAuthenticationElement, PaymentElement } from "@stripe/react-stripe-js"

export default function CommissionCheckoutForm() {

    return (
        <form id="payment-form" className="flex flex-col gap-5">
            <LinkAuthenticationElement id="link-authentication-element" />
            <div className="divider"></div>
            <ExpressCheckoutElement id="express-payment-element" onConfirm={() => console.log('hello, world')} />
            <div className="divider">OR</div>
            <PaymentElement id="payment-element" />
            <button id="submit" className="btn btn-primary">Request Commission</button>
        </form>
    )
}