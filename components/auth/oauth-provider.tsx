'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

import { BuiltInProviderType } from 'next-auth/providers/index'
import { ClientSafeProvider, LiteralUnion } from 'next-auth/react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGoogle, faXTwitter, faDiscord } from '@fortawesome/free-brands-svg-icons'
import { faEnvelope } from '@fortawesome/free-solid-svg-icons'

export default function OAuthProviders({
    providers
}: {
    providers: Record<LiteralUnion<BuiltInProviderType, string>, ClientSafeProvider>
}) {
    const [email, setEmail] = useState('')

    return (
        <div className="flex flex-col justify-center items-center gap-5">
            <div className="flex flex-col w-full gap-5">
                <input
                    name="email"
                    id="email"
                    type="email"
                    placeholder="Email"
                    className="input w-full"
                    onChange={(e) => setEmail(e.currentTarget.value)}
                />
                <button
                    className="btn btn-primary w-full"
                    onClick={() => signIn('email', { email })}
                >
                    <FontAwesomeIcon icon={faEnvelope} className="w-5 h-5" />
                    Sign In
                </button>
            </div>
            <div className="divider">OR</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full">
                <button
                    className="btn btn-square w-full"
                    onClick={() => signIn(providers.google.id)}
                >
                    <FontAwesomeIcon icon={faGoogle} className="w-5 h-5" />
                    Google
                </button>
                <button
                    className="btn btn-square w-full"
                    onClick={() => signIn(providers.twitter.id)}
                >
                    <FontAwesomeIcon icon={faXTwitter} className="w-5 h-5" />
                    Twitter
                </button>
                <button
                    className="btn btn-square w-full"
                    onClick={() => signIn(providers.discord.id)}
                >
                    <FontAwesomeIcon icon={faDiscord} className="w-5 h-5" />
                    Discord
                </button>
            </div>
            <div className="divider"></div>
        </div>
    )
}
