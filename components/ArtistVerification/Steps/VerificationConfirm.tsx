'use client'

import useVerificationFormStore from "@/store/VerificationForm";
import ArtistAction from "../ArtistAction";

export default function VerificationConfirmation() {
    const { requestedHandle, twitter, pixiv, location, verificationMethod } = useVerificationFormStore()

    return (
        <div className="py-5">
            <ArtistAction method={verificationMethod} />
        </div>
    )

}