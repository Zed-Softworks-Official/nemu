import { getProviders } from 'next-auth/react'
import { redirect } from 'next/navigation'

import EmailProvider from '~/components/auth/email-provider'
import OAuthProvider from '~/components/auth/oauth-provider'

import { getServerAuthSession } from '~/server/auth'

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
        <div className="flex flex-col justify-center items-center gap-5">
            <div className="flex flex-col w-full gap-5">
                <EmailProvider />
            </div>
            <div className="divider">OR</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full">
                <OAuthProvider provider={providers.google} />
                <OAuthProvider provider={providers.twitter} />
                <OAuthProvider provider={providers.discord} />
            </div>
            <div className="divider"></div>
        </div>
        
    )
}
