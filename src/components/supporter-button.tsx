'use client'

import { useRouter } from 'next/navigation'

import { Button } from '~/components/ui/button'
import { supporter_monthly, supporter_annual } from '~/server/actions'

export default function SupporterButton(props: { term: 'monthly' | 'annual' }) {
    const router = useRouter()

    return (
        <Button
            onClick={async () => {
                const res =
                    props.term === 'monthly'
                        ? await supporter_monthly()
                        : await supporter_annual()

                if (!res.redirect_url) {
                    throw new Error('Redirect url not found!')
                }

                return router.replace(res.redirect_url)
            }}
            className="btn btn-primary btn-wide mt-10 text-white"
        >
            Become a supporter
        </Button>
    )
}
