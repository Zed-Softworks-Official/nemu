import AuthError from '@/components/auth/auth-error'
import OAuthProviders from '@/components/auth/oauth-provider'
import { getServerAuthSession } from '@/core/auth'

import { getProviders } from 'next-auth/react'
import { redirect } from 'next/navigation'

export default async function Login() {
    const providers = await getProviders()
    const session = await getServerAuthSession()

    if (session) {
        return redirect('/')
    }

    if (!providers) {
        return redirect('/')
    }

    return (
        <div>
            <AuthError />
            <OAuthProviders providers={providers} />
        </div>
    )
}
