'use clinet'

import { useFormStatus } from 'react-dom'

import { Button } from '~/components/ui/button'
import type { VerificationMethod } from '~/core/structures'

export default function SubmitButton(props: {
    verification_method?: VerificationMethod
}) {
    const { pending } = useFormStatus()

    return (
        <Button
            type="submit"
            disabled={pending || props.verification_method === undefined}
        >
            <NextButtonText pending={pending} />
        </Button>
    )
}

function NextButtonText(props: { pending: boolean }) {
    if (props.pending) {
        return <span className="loading loading-spinner"></span>
    }

    return <>Submit</>
}
