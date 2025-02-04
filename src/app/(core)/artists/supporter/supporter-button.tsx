'use client'

import { useRouter } from 'next/navigation'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'

export default function SupporterButton(props: { term: 'monthly' | 'annual' }) {
    const router = useRouter()
    const mutation = api.supporter.generate_url.useMutation()

    return (
        <Button
            size="lg"
            onClick={async () => {
                const res = await mutation.mutateAsync(props.term)
                if (res.redirect_url) {
                    router.push(res.redirect_url)
                }
            }}
        >
            Become A Supporter
        </Button>
    )
}
