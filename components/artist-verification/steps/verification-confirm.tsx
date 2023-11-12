'use client'

import useVerificationFormStore from '@/store/VerificationForm'
import ArtistAction from '../artist-action'

export default function VerificationConfirmation() {
    const { verificationMethod } = useVerificationFormStore()

    return (
        <div className="py-5">
            <ArtistAction method={verificationMethod} />
        </div>
    )
}
