import AuthError from '@/components/auth/auth-error'
import AuthRedirect from '@/components/auth/auth-redirect'
import OAuthProviders from '@/components/auth/oauth-provider'

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
