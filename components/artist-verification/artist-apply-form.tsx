'use client'

import * as z from 'zod'

import {
    CheckCircleIcon,
    ChevronLeftIcon,
    ChevronRightIcon
} from '@heroicons/react/20/solid'
import { useState } from 'react'

import TextField from '../form/text-input'
import { CountryDropdown } from 'react-country-region-selector'
import { cn } from '@/lib/utils'
import { useSession } from 'next-auth/react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { RadioGroup } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXTwitter } from '@fortawesome/free-brands-svg-icons'
import { faCode, faEnvelope } from '@fortawesome/free-solid-svg-icons'
import NemuImage from '../nemu-image'

const steps = [
    {
        name: 'Artist Information',
        fields: ['requested_handle', 'twitter_url', 'website_url', 'location']
    },
    { name: 'Verification Method', fields: ['verification_method'] },
    { name: 'Get Verified', fields: ['artist_code'] }
]

enum Method {
    Twitter,
    Email,
    ArtistCode
}

interface VerificationMethod {
    id: string
    name: string
    method: Method
}

const methods: VerificationMethod[] = [
    {
        id: 'twitter',
        name: 'X (Twitter)',
        method: Method.Twitter
    },
    // {
    //     name: 'Email',
    //     icon: SocialIcon.Email,
    //     method: MethodEnum.Email
    // },
    {
        id: 'artist_code',
        name: 'Artist Code',
        method: Method.ArtistCode
    }
]

// TODO: add username check
const verificationSchema = z.object({
    requested_handle: z
        .string()
        .min(1, 'Handles must be longer then one character!')
        .refine(
            (value) => !value.includes('@'),
            'Handles will contain "@" by default, no need to add them'
        ),
    twitter_url: z.string().url('Must be a valid url!'),
    website_url: z.string().url('Must be a valid url!').optional().or(z.literal('')),
    location: z
        .string()
        .min(1, 'Must choose a location')
        .refine(
            (value) => value === 'United States',
            'Nemu is only available in the U.S. currently!'
        ),
    verification_method: z.string().min(1, 'Must select a verificatio method'),
    artist_code: z.string().min(1, 'Must have a valid artist code')
})

type VerificationSchemaType = z.infer<typeof verificationSchema>

export default function ArtistApplyForm() {
    const { data: session } = useSession()

    const [currentStep, setCurrentStep] = useState(0)

    const {
        trigger,
        control,
        register,
        formState: { errors },
        getValues,
        handleSubmit
    } = useForm<VerificationSchemaType>({
        resolver: zodResolver(verificationSchema),
        mode: 'onSubmit',
        defaultValues: {
            twitter_url:
                session?.user.provider == 'twitter'
                    ? `https://x.com/${session.user.name}`
                    : ''
        }
    })

    type FieldName = keyof VerificationSchemaType

    function ProcessForm(verification_data: VerificationSchemaType) {
        console.log(verification_data)
    }

    async function Next() {
        const fields = steps[currentStep].fields
        const output = await trigger(fields as FieldName[], { shouldFocus: true })

        if (!output) return

        if (currentStep < steps.length - 1) {
            setCurrentStep((step) => step + 1)
        }
    }

    function Prev() {
        if (currentStep > 0) {
            setCurrentStep((step) => step - 1)
        }
    }

    function ConvertIconToReact(icon: Method) {
        switch (icon) {
            case Method.Twitter:
                return <FontAwesomeIcon className="w-10 h-10" icon={faXTwitter} />
            case Method.Email:
                return <FontAwesomeIcon className="w-10 h-10" icon={faEnvelope} />
            case Method.ArtistCode:
                return <FontAwesomeIcon className="w-10 h-10" icon={faCode} />
        }
    }

    return (
        <div className="flex flex-col w-full gap-5">
            <ul className="steps">
                {steps.map((step, i) => (
                    <li
                        className={cn(
                            'step before:transition-all before:duration-150 after:transition-all after:duration-150',
                            currentStep < i
                                ? 'before:!bg-base-100 after:!bg-base-100'
                                : 'before:!bg-primary after:!bg-primary'
                        )}
                    >
                        {step.name}
                    </li>
                ))}
            </ul>
            <div className="divider"></div>
            <form
                className="flex flex-col gap-5 w-full"
                onSubmit={handleSubmit(ProcessForm)}
            >
                {currentStep == 0 && (
                    <>
                        <TextField
                            label="Requested Handle*"
                            placeholder="@username"
                            error={errors.requested_handle ? true : false}
                            errorMessage={errors.requested_handle?.message}
                            {...register('requested_handle')}
                        />
                        <TextField
                            label="Twitter URL*"
                            placeholder="https://twitter.com/username"
                            error={errors.twitter_url ? true : false}
                            errorMessage={errors.twitter_url?.message}
                            {...register('twitter_url')}
                        />
                        <TextField
                            label="Website"
                            placeholder="https://myawesome.portfolio"
                            error={errors.website_url ? true : false}
                            errorMessage={errors.website_url?.message}
                            {...register('website_url')}
                        />
                        <Controller
                            name="location"
                            control={control}
                            render={({ field }) => (
                                <div className="form-control">
                                    <label className="label">Location*: </label>
                                    <CountryDropdown
                                        value={getValues('location')}
                                        classes={cn(
                                            'select w-full',
                                            errors.location ? 'select-error' : ''
                                        )}
                                        onChange={(value) => field.onChange(value)}
                                    />
                                    {errors.location && (
                                        <label className="label text-error">
                                            {errors.location?.message}
                                        </label>
                                    )}
                                    <p className="text-base-content/80 italic mt-5">
                                        Note: Only Artists located inside of the U.S. can
                                        get verified as of right now. We are working on
                                        including more countries in the future!
                                    </p>
                                </div>
                            )}
                        />
                    </>
                )}

                {currentStep == 1 && (
                    <Controller
                        name="verification_method"
                        control={control}
                        render={({ field }) => (
                            <RadioGroup
                                value={getValues('verification_method')}
                                onChange={field.onChange}
                            >
                                <RadioGroup.Label className="sr-only">
                                    Verification Method
                                </RadioGroup.Label>
                                <div className="space-y-2">
                                    {methods.map((verification) => (
                                        <RadioGroup.Option
                                            key={verification.name}
                                            value={verification.id}
                                            className={({ active, checked }) =>
                                                `${
                                                    active
                                                        ? 'ring-2 ring-white ring-opacity-60 ring-offset-2 ring-offset-primary'
                                                        : ''
                                                }
                                            ${
                                                checked
                                                    ? 'bg-primary bg-opacity-75 text-white'
                                                    : 'bg-charcoal'
                                            }
                                            relative flex cursor-pointer rounded-3xl px-5 py-4 shadown-md focus:outline-none`
                                            }
                                        >
                                            {({ active, checked }) => (
                                                <>
                                                    <div className="flex w-full justify-center">
                                                        <div className="flex flex-col items-center">
                                                            <RadioGroup.Label
                                                                as="p"
                                                                className={`font-medium my-5 ${checked ? 'text-white' : 'text-white/40'}`}
                                                            >
                                                                {ConvertIconToReact(
                                                                    verification.method
                                                                )}
                                                            </RadioGroup.Label>
                                                            <RadioGroup.Description
                                                                as="p"
                                                                className={`mb-5`}
                                                            >
                                                                {verification.name}
                                                            </RadioGroup.Description>
                                                        </div>
                                                    </div>
                                                    {checked && (
                                                        <div className="shrink-0 text-white absolute right-5 top-14">
                                                            <CheckCircleIcon className="h-10 w-10" />
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </RadioGroup.Option>
                                    ))}
                                </div>
                            </RadioGroup>
                        )}
                    />
                )}

                {currentStep === 2 && (
                    <div className="flex flex-col">
                        {getValues('verification_method') === 'artist_code' && (
                            <div className="flex flex-col w-full gap-5">
                                <div className="flex flex-col justify-center items-center gap-5">
                                    <NemuImage
                                        src={'/nemu/sparkles.png'}
                                        alt="Nemu with a form"
                                        width={200}
                                        height={200}
                                    />
                                    <h2 className="card-title">Just one more step!</h2>
                                    <p>
                                        Just paste the artist code you received into the
                                        box below and we'll validate it for you and you
                                        can start your journey!
                                    </p>
                                </div>
                                <div className="divider"></div>
                                <div className="form-control">
                                    <TextField
                                        label="Artist Code"
                                        placeholder="Paste Code Here!"
                                        error={errors.artist_code ? true : false}
                                        errorMessage={errors.artist_code?.message}
                                        {...register('artist_code')}
                                    />
                                </div>
                            </div>
                        )}
                        {getValues('verification_method') === 'twitter' && (
                            <div className="flex flex-col justify-center items-center gap-5">
                                <NemuImage
                                    src={'/nemu/sad.png'}
                                    alt="Nemu Sad"
                                    width={200}
                                    height={200}
                                />
                                <h2 className="card-title">Unfortunately</h2>
                                <p>We only allow artist code verification right now!</p>
                            </div>
                        )}
                    </div>
                )}
            </form>
            <div className="divider"></div>
            <div className="flex justify-between w-full">
                <button
                    className="btn btn-outline disabled:btn-outline disabled:opacity-80 disabled:cursor-not-allowed"
                    disabled={currentStep === 0}
                    onClick={() => Prev()}
                >
                    <ChevronLeftIcon className="w-6 h-6" />
                </button>
                {currentStep === 2 ? (
                    <button className="btn btn-primary" type={'submit'}>
                        Submit
                    </button>
                ) : (
                    <button
                        className="btn btn-primary"
                        type={'button'}
                        onClick={async () => await Next()}
                    >
                        <ChevronRightIcon className="w-6 h-6" />
                    </button>
                )}
            </div>
        </div>
    )
}
