'use client'

import { MouseEvent } from 'react'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import { toast } from 'react-toastify'

import useVerificationFormStore, { MethodEnum } from '@/store/VerificationForm'
import { ArtistCodeVerification, ArtistTwitterVerification } from '@/helpers/artist-verification'

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
                        username: session?.user.name!,
                        requested_handle: requestedHandle,
                        twitter: twitter,
                        pixiv: pixiv,
                        location: location
                    })
                    break;
                // If they used twitter
                case MethodEnum.Twitter:
                    await ArtistTwitterVerification(session?.user.user_id!, {
                        user_id: session?.user.user_id!,
                        username: session?.user.name!,
                        requested_handle: requestedHandle,
                        twitter: twitter,
                        pixiv: pixiv,
                        location: location
                    })
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