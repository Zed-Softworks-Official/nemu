import React from 'react'

import DefaultPageLayout from '@/app/(default)/layout'
import StepsLayout from '@/components/artist-verification/layout/steps-layout'
import AuthCheck from '@/components/auth/auth-check'

export default async function VerificationLayout({ children, } : { children: React.ReactNode }) {

    return (
        <AuthCheck>
            <DefaultPageLayout>
                <div className='container mx-auto bg-base-300 p-5 rounded-xl'>
                    <div className='mb-10'>
                        <h1 className='text-center'>Artists Wanted!</h1>
                        <h2 className='text-center'>Fill out this form to start the verification process!</h2>
                        <hr className='seperation' />
                    </div>
                    <div className='py-16 px-4 flex justify-center items-center w-full'>
                        <StepsLayout>
                            {children}
                        </StepsLayout>
                    </div>
                </div>
            </DefaultPageLayout>
        </AuthCheck>
    )
}