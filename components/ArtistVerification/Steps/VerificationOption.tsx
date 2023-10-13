'use client'

import { useState } from 'react'
import { RadioGroup } from '@headlessui/react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCode, faEnvelope } from '@fortawesome/free-solid-svg-icons'
import { faXTwitter } from '@fortawesome/free-brands-svg-icons'
import useVerificationFormStore, { MethodEnum, VerificationMethod } from '@/store/VerificationForm'

enum SocialIcon {
    Twitter, Email, ArtistCode
}

const methods: VerificationMethod[] = [
    {
        name: 'X (Twitter)',
        icon: SocialIcon.Twitter,
        method: MethodEnum.Twitter
    },
    {
        name: 'Email',
        icon: SocialIcon.Email,
        method: MethodEnum.Email
    },
    {
        name: 'Artist Code',
        icon: SocialIcon.ArtistCode,
        method: MethodEnum.ArtistCode
    }
]

export default function VerificationOption() {
    const { verificationMethod, setVerificationMethod } = useVerificationFormStore()

    return (
        <div className='w-full mb-10'>
            <div className='mx-auto w-full max-w-md'>
                <RadioGroup value={verificationMethod} onChange={setVerificationMethod}>
                    <RadioGroup.Label className='sr-only'>Verification Method</RadioGroup.Label>
                    <div className='space-y-2'>
                        { methods.map( (method) => (
                            <RadioGroup.Option
                                key={method.name}
                                value={method}
                                className={ ({active, checked}) => 
                                    `${
                                        active
                                        ? 'ring-2 ring-white ring-opacity-60 ring-offset-2 ring-offset-primary'
                                        : ''
                                    }
                                    ${
                                        checked ? 'bg-primary bg-opacity-75 text-white' : 'bg-charcoal'
                                    }
                                    relative flex cursor-pointer rounded-3xl px-5 py-4 shadown-md focus:outline-none`
                                }
                            >
                                {({ active, checked }) => (
                                    <>
                                        <div className='flex w-full justify-center'>
                                            <div className='flex flex-col items-center'>
                                                <RadioGroup.Label as='p' className={`font-medium my-5 ${checked ? 'text-white' : 'text-white/40'}`}>
                                                    {ConvertIconToReact(method.icon)}
                                                </RadioGroup.Label>
                                                <RadioGroup.Description as='p' className={`mb-5`}>
                                                    {method.name}
                                                </RadioGroup.Description>
                                            </div>
                                        </div>
                                        { checked && (
                                            <div className='shrink-0 text-white absolute right-5 top-14'>
                                                <CheckIcon className='h-10 w-10' />
                                            </div>
                                        )}
                                    </>
                                )}
                            </RadioGroup.Option>
                        ))}
                    </div>
                </RadioGroup>
            </div>
        </div>
    )
}

function CheckIcon(props: any) {
    return (
        <svg viewBox="0 0 24 24" fill="none" {...props}>
            <circle cx={12} cy={12} r={12} fill="#fff" opacity="0.2" />
            <path
                d="M7 13l3 3 7-7"
                stroke="#fff"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

function ConvertIconToReact(icon: SocialIcon) {
    switch (icon) {
        case SocialIcon.Twitter:
            return (<FontAwesomeIcon className='w-10 h-10' icon={faXTwitter} />)
        case SocialIcon.Email:
            return (<FontAwesomeIcon className='w-10 h-10' icon={faEnvelope} />)
        case SocialIcon.ArtistCode:
            return (<FontAwesomeIcon className='w-10 h-10' icon={faCode} />)
    }
}