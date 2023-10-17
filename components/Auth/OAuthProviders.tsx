'use client'

import { signIn } from 'next-auth/react'

import { BuiltInProviderType } from 'next-auth/providers/index'
import { ClientSafeProvider, LiteralUnion } from 'next-auth/react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTwitter, faGoogle, faApple } from '@fortawesome/free-brands-svg-icons'

import Link from 'next/link'

export default function OAuthProviders({ providers, csrfToken }: { providers: Record<LiteralUnion<BuiltInProviderType, string>, ClientSafeProvider>, csrfToken: string } ) {
    function getIcon(provider_name: string) {
        switch (provider_name) {
            case 'Twitter':
                return (<FontAwesomeIcon icon={faTwitter} className='mr-5' />)
            case 'Apple':
                return (<FontAwesomeIcon icon={faApple} className='mr-5' />)
            case 'Google':
                return (<FontAwesomeIcon icon={faGoogle} className='mr-5' />)
        }
    }

    return (
        <>
            {Object.values(providers!).map((provider) => (
                <div key={provider.name} className='my-5'>
                    {provider.name == 'credentials' && (
                        <form method='post' action={`/api/auth/callback/credentials`}>
                            <div>
                                <input name='csrfToken' type='hidden' defaultValue={csrfToken} />
                            </div>
                            <div className='mt-5'>
                                <label htmlFor='name' className='block mb-5'>Username</label>
                                <input name='name' type='text' className='bg-white dark:bg-charcoal p-5 rounded-xl w-full' placeholder='Username' />
                            </div>
                            <div className='mt-5'>
                                <label htmlFor='password' className='block mb-5'>Password</label>
                                <input name='password' type='password' className='bg-white dark:bg-charcoal p-5 rounded-xl w-full' placeholder='Password' />
                            </div>
                            <div className='mt-5'>
                                <button className='dark:bg-charcoal bg-white p-5 rounded-3xl w-full' type='submit'>
                                    Sign In
                                </button>
                            </div>
                            <hr className='seperation' />
                        </form>
                    )}

                    {provider.name != 'credentials' && (
                        <button onClick={() => { signIn(provider.id) }} className='dark:bg-charcoal bg-white p-5 rounded-3xl w-full'>
                            { getIcon(provider.name) }
                            Sign in with {provider.name}
                        </button>
                     )}
                </div>
            ))}
            <p className='text-center pt-5'>
                Don&apos;t have an account? <Link href={'/u/signup'}>Sign Up Here!</Link>
            </p>
        </>
    )    
}