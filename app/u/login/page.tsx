import OAuthProviders from '@/components/Auth/OAuthProviders'

import { getSession, getProviders } from 'next-auth/react'
import { redirect } from 'next/navigation'

export default async function Login() {
    // If the user is already signed in then redirect them to the home page
    let session = await getSession()
    if (session?.user) {
        redirect('/')
    }

    // Get the providers
    const providers = await getProviders()

    return (
        <>
            <OAuthProviders providers={providers!} />
        </>
    )
}