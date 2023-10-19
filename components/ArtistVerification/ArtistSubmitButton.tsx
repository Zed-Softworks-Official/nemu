'use client'

import { MouseEvent } from 'react'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

import useVerificationFormStore, { MethodEnum } from '@/store/VerificationForm'
import { ArtistCodeVerification } from '@/helpers/artist-verification'
import { toast } from 'react-toastify'


export default function ArtistSubmitButton() {
    const { 
        requestedHandle, 
        twitter,
        pixiv,
        location,
        verificationMethod,
        artistCode
    } = useVerificationFormStore()

    const { data: session } = useSession()
    const { replace } = useRouter() 

    async function handleSubmit(event: MouseEvent<HTMLButtonElement>) {
        event.preventDefault()

        try {
            // Check to see what method was used
            switch (verificationMethod.method) {
                // If they used an artist code
                case MethodEnum.ArtistCode:
                    await ArtistCodeVerification(artistCode!, session?.user.user_id!, {
                        user_id: session?.user.user_id!,
                        requested_handle: requestedHandle,
                        twitter: twitter,
                        pixiv: pixiv,
                        location: location
                    })
                    break;
                // If they used twitter
                case MethodEnum.Twitter:
                    break;
                // If they used email
                case MethodEnum.Email:
                    break;
            }

            // Send Toast Message

            // If they used an artist code take them to their new profile
            if (artistCode) {
                replace(`/@${requestedHandle}`)
            }

            // Go Back to homepage
            replace('/');

        } catch (error) {
            console.log(error)
        }
    }

    return (
        <button type="button" onClick={handleSubmit} className="p-5 rounded-xl text-xl font-bold bg-gradient-to-r from-primarylight to-azure">
            Submit
        </button>
    )
}