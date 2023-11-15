'use client'

import { useShopContext } from './shop-context'

export default function SetShopContext({
    handle,
    stripe_account
}: {
    handle: string
    stripe_account: string
}) {
    const { setHandle, setStripeAccount } = useShopContext()

    function setHandleAndAccount() {
        setHandle!(handle)
        setStripeAccount!(stripe_account)
    }

    return <>{setHandleAndAccount()}</>
}
