import AuthError from '@/components/Auth/AuthError'
import AuthRedirect from '@/components/Auth/AuthRedirect'
import OAuthProviders from '@/components/Auth/OAuthProviders'

import { getProviders } from 'next-auth/react'

export default async function Login() {
    // Get the providers
    const providers = await getProviders()

    return (
        <AuthRedirect>
            <AuthError />
            <OAuthProviders providers={providers!} />
        </AuthRedirect>
    )
}