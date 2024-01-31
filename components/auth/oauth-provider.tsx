'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

import { BuiltInProviderType } from 'next-auth/providers/index'
import { ClientSafeProvider, LiteralUnion } from 'next-auth/react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGoogle, faApple, faXTwitter } from '@fortawesome/free-brands-svg-icons'
import { faEnvelope } from '@fortawesome/free-solid-svg-icons'

export default function OAuthProviders({
    providers
}: {
    providers: Record<LiteralUnion<BuiltInProviderType, string>, ClientSafeProvider>
}) {
    const [email, setEmail] = useState('')

    function getIcon(provider_name: string) {
        switch (provider_name) {
            case 'Twitter':
                return (
                    <FontAwesomeIcon
                        icon={faXTwitter}
                        className="mr-5 w-5 h-5 align-bottom"
                    />
                )
            case 'Apple':
                return (
                    <FontAwesomeIcon
                        icon={faApple}
                        className="mr-5 w-5 h-5 align-bottom"
                    />
                )
            case 'Google':
                return (
                    <FontAwesomeIcon
                        icon={faGoogle}
                        className="mr-5 w-5 h-5 align-bottom"
                    />
                )
        }
    }

    return (
        <>
            {Object.values(providers!).map((provider) => (
                <div key={provider.name}>
                    {provider.type != 'oauth' && (
                        <div className="flex flex-col gap-5">
                            <div>
                                <input
                                    name="email"
                                    id="email"
                                    type="email"
                                    className="input p-5 rounded-xl w-full"
                                    placeholder="Email"
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div>
                                <button
                                    className="btn btn-primary w-full"
                                    onClick={() => signIn('email', { email: email })}
                                >
                                    <FontAwesomeIcon
                                        icon={faEnvelope}
                                        className="mr-5 w-5 h-5 align-bottom"
                                    />
                                    Sign In
                                </button>
                            </div>
                            <div className="flex flex-col w-full mt-5">
                                <div className="divider">OR</div>
                            </div>
                        </div>
                    )}

                    {provider.type == 'oauth' && (
                        <button
                            onClick={() => {
                                signIn(provider.id)
                            }}
                            className="btn btn-base-100 w-full"
                        >
                            {getIcon(provider.name)}
                            Sign in with {provider.name}
                        </button>
                    )}
                </div>
            ))}
        </>
    )
}
