'use client'

import VertificationStep from "@/components/ArtistVerification/VerificationStep";
import useVerificationFormStore from "@/store/VerificationForm";

export default function VerificationStepThree() {
    const { requestedHandle, twitter, pixiv, location, verificationMethod } = useVerificationFormStore()

    return (
        <VertificationStep back="/artists/apply/step-two" next="/artists/apply/step-three" >
            <div className="py-5">
                <p>Handle: {requestedHandle}</p>
                <p>Twitter URL: {twitter}</p>
                <p>Pixiv URL: {pixiv}</p>
                <p>Location: {location}</p>
                <p>Verification Method: {verificationMethod.name}</p>
            </div>
        </VertificationStep>
    )
}