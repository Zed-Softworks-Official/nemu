import AuthError from '@/components/auth/auth-error'
import OAuthProviders from '@/components/auth/oauth-provider'

import { getProviders } from 'next-auth/react'
import { getServerAuthSession } from '@/app/api/auth/[...nextauth]/route'
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
