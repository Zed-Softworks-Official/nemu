'use client'

import { ArtistCodeVerification } from "@/helpers/artist-verification";
import useVerificationFormStore, { MethodEnum } from "@/store/VerificationForm";
import { useUser } from "@auth0/nextjs-auth0/client";
import { useRouter } from "next/navigation";
import { MouseEvent } from "react";

export default function ArtistSubmitButton() {
    const { 
        requestedHandle, 
        twitter,
        pixiv,
        location,
        verificationMethod,
        artistCode
    } = useVerificationFormStore();

    const { user } = useUser();
    const { replace } = useRouter(); 

    async function handleSubmit(event: MouseEvent<HTMLButtonElement>) {
        event.preventDefault();

        try {
            // Check to see what method was used
            switch (verificationMethod.method) {
                // If they used an artist code
                case MethodEnum.ArtistCode:
                    await ArtistCodeVerification(artistCode!, user!.sub!);
                    break;
                // If they used twitter
                case MethodEnum.Twitter:
                    break;
                // If they used email
                case MethodEnum.Email:
                    break;
            }

            //replace('/');

        } catch (error) {
            console.log(error);
        }
    }

    return (
        <button type="button" onClick={handleSubmit} className="p-5 rounded-xl text-xl font-bold bg-gradient-to-r from-primarylight to-azure">
            Submit
        </button>
    )
}