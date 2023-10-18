'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'

import { BuiltInProviderType } from 'next-auth/providers/index'
import { ClientSafeProvider, LiteralUnion } from 'next-auth/react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTwitter, faGoogle, faApple } from '@fortawesome/free-brands-svg-icons'

export default function OAuthProviders({ providers }: { providers: Record<LiteralUnion<BuiltInProviderType, string>, ClientSafeProvider> } ) {
    const [email, setEmail] = useState('')

    function getIcon(provider_name: string) {
        switch (provider_name) {
            case 'Twitter':
                return (<FontAwesomeIcon icon={faTwitter} className='mr-5 w-5 h-5 align-bottom' />)
            case 'Apple':
                return (<FontAwesomeIcon icon={faApple} className='mr-5 w-5 h-5 align-bottom' />)
            case 'Google':
                return (<FontAwesomeIcon icon={faGoogle} className='mr-5 w-5 h-5 align-bottom' />)
        }
    }

    return (
        <>
            {Object.values(providers!).map((provider) => (
                <div key={provider.name} className='my-5'>
                    {provider.name == 'credentials' && (
                        <div>
                            <div className='mt-5'>
                                <label htmlFor='email' className='block mb-5'>Email</label>
                                <input name='email' id='email' type='email' className='bg-white dark:bg-charcoal p-5 rounded-xl w-full' placeholder='Email' onChange={(e) => setEmail(e.target.value)} />
                            </div>
                            <div className='mt-5'>
                                <button className='dark:bg-charcoal bg-white p-5 rounded-3xl w-full' onClick={() => signIn('email', { email: email})}>
                                    Sign In
                                </button>
                            </div>
                            <div className='flex items-center justify-center space-x-2 my-5'>
                                <span className='h-px w-16 dark:bg-white bg-charcoal'></span>
                                <p className='uppercase text-center'>or</p>
                                <span className='h-px w-16 dark:bg-white bg-charcoal'></span>
                            </div>
                        </div>
                    )}

                    {provider.name != 'credentials' && (
                        <button onClick={() => { signIn(provider.id) }} className='dark:bg-charcoal bg-white p-5 rounded-3xl w-full hover:bg-primary'>
                            { getIcon(provider.name) }
                            Sign in with {provider.name}
                        </button>
                     )}
                </div>
            ))}
        </>
    )    
}