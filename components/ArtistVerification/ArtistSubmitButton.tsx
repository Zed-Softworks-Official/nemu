'use client'

import useVerificationFormStore, { MethodEnum } from "@/store/VerificationForm";
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

    async function handleSubmit(event: MouseEvent<HTMLButtonElement>) {
        event.preventDefault();

        try {
            // Check to see what method was used
            switch (verificationMethod.method) {
                // If they used an artist code
                case MethodEnum.ArtistCode:
                    
                    break;
            }

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