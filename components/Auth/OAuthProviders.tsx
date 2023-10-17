'use client'

import { BuiltInProviderType } from 'next-auth/providers/index'
import { ClientSafeProvider, LiteralUnion } from 'next-auth/react'

export default function OAuthProviders({ providers, csrfToken }: { providers: Record<LiteralUnion<BuiltInProviderType, string>, ClientSafeProvider>, csrfToken: string } ) {
    return (
        <>
            {Object.values(providers!).map((provider) => (
                <div key={provider.name} className='my-5'>
                    {provider.name == 'credentials' && (
                        <form method='post' action={`/api/auth/callback/credentials`}>
                            <input name='csrfToken' type='hidden' defaultValue={csrfToken} />
                            <div>
                                <label className='block mb-5'>Username</label>
                                <input name='name' type='text' className='bg-white dark:bg-charcoal p-5 rounded-xl w-full' placeholder='Username' />
                            </div>
                            <div className='mt-5'>
                                <label className='block mb-5'>Password</label>
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
                        <button className='dark:bg-charcoal bg-white p-5 rounded-3xl w-full'>
                            Sign in with {provider.name}
                        </button>
                     )}
                </div>
            ))}
        </>
    )    
}