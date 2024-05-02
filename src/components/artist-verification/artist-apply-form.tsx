'use client'

import * as z from 'zod'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useState } from 'react'
import { motion } from 'framer-motion'

import { api } from '~/trpc/react'
import { cn, nemu_toast } from '~/lib/utils'

import { Input } from '~/components/ui/input'
import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group'
import { Label } from '~/components/ui/label'
import NemuImage from '~/components/nemu-image'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { VerificationMethod } from '~/core/structures'
import SelectCountries from '~/components/ui/select-countries'
import { User } from '@clerk/nextjs/server'
import { useUser } from '@clerk/nextjs'
import { useTheme } from 'next-themes'

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

type VerificationMethodInterface = {
    id: string
    name: string
    method: Method
}

const methods: VerificationMethodInterface[] = [
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

    artist_code: z.string().optional()
})

type VerificationSchemaType = z.infer<typeof verificationSchema>

export default function ArtistApplyForm() {
    const [previousStep, setPreviousStep] = useState(0)
    const [currentStep, setCurrentStep] = useState(0)
    const delta = currentStep - previousStep

    const { user } = useUser()
    const { resolvedTheme } = useTheme()

    const codeCheckMutation = api.verification.get_artist_code.useMutation()
    const handleExistsMutation = api.verification.handle_exists.useMutation()
    const verificationMutation = api.verification.set_verification.useMutation({
        onSuccess: () => {}
    })

    const form = useForm<VerificationSchemaType>({
        resolver: zodResolver(verificationSchema),
        mode: 'onSubmit'
    })

    function ProcessForm(data: VerificationSchemaType) {
        verificationMutation.mutate({
            location: data.location,
            requested_handle: data.requested_handle,
            artist_code: data.artist_code || undefined,
            method: data.artist_code
                ? VerificationMethod.Code
                : VerificationMethod.Twitter,
            twitter: data.twitter_url,
            website: data.website_url,
            username: user?.username || undefined
        })
    }

    type FieldName = keyof VerificationSchemaType

    async function Next() {
        const fields = steps[currentStep]!.fields
        const output = await form.trigger(fields as FieldName[], { shouldFocus: true })

        if (!output) return

        if (currentStep === 0) {
            const res = await handleExistsMutation.mutateAsync(
                form.getValues('requested_handle')
            )
            if (res.exists) {
                form.setError(
                    'requested_handle',
                    { message: 'Oh Nyo! The handle you requested is already taken!' },
                    { shouldFocus: true }
                )

                return
            }
        }

        if (
            currentStep === 2 &&
            form.getValues('verification_method') === 'artist_code'
        ) {
            const toast_id = nemu_toast.loading('Checking artist code', {
                theme: resolvedTheme
            })
            const res = await codeCheckMutation.mutateAsync(
                form.getValues('artist_code')!
            )

            if (!res.success) {
                nemu_toast.update(toast_id, {
                    isLoading: false,
                    type: 'error',
                    render: 'Artist code invalid!',
                    autoClose: 5000
                })

                form.setError(
                    'artist_code',
                    { message: 'Must have a valid artist code' },
                    { shouldFocus: true }
                )

                return
            }

            nemu_toast.update(toast_id, {
                isLoading: false,
                type: 'success',
                render: 'Artist code valid!',
                autoClose: 5000
            })
        }

        if (currentStep === 2) {
            await form.handleSubmit(ProcessForm)()

            return
        }

        if (currentStep < steps.length - 1) {
            setPreviousStep(currentStep)
            setCurrentStep((step) => step + 1)
        }
    }

    function Prev() {
        if (currentStep > 0) {
            setPreviousStep(currentStep)
            setCurrentStep((step) => step - 1)
        }
    }

    return (
        <div className="flex w-full flex-col gap-5 transition-all duration-200 ease-in-out">
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
            <Form {...form}>
                <form
                    className="flex w-full flex-col gap-5"
                    onSubmit={form.handleSubmit(ProcessForm)}
                >
                    {currentStep == 0 && (
                        <motion.div
                            initial={{ x: delta >= 0 ? '50%' : '-50%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ duration: 0.3, east: 'easeInOut' }}
                            className="flex flex-col gap-5"
                        >
                            <FormField
                                control={form.control}
                                name="requested_handle"
                                render={({ field }) => (
                                    <FormItem className="form-control">
                                        <FormLabel className="label">
                                            Requested Handle*
                                        </FormLabel>
                                        <Input placeholder="@handle" {...field} />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="twitter_url"
                                render={({ field }) => (
                                    <FormItem className="form-control">
                                        <FormLabel className="label">
                                            Twitter URL*
                                        </FormLabel>
                                        <Input
                                            placeholder="https://twitter.com/username"
                                            {...field}
                                        />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="website_url"
                                render={({ field }) => (
                                    <FormItem className="form-control">
                                        <FormLabel className="label">
                                            Website URL
                                        </FormLabel>
                                        <Input
                                            placeholder="https://myawesome.portfolio"
                                            {...field}
                                        />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="location"
                                render={({ field }) => (
                                    <FormItem className="form-control">
                                        <FormLabel className="label">Location*</FormLabel>
                                        <SelectCountries
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                        />
                                    </FormItem>
                                )}
                            />
                        </motion.div>
                    )}

                    {currentStep === 1 && (
                        <motion.div
                            initial={{ x: delta >= 0 ? '50%' : '-50%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ duration: 0.3, east: 'easeInOut' }}
                        >
                            <FormField
                                control={form.control}
                                name="verification_method"
                                render={({ field }) => (
                                    <RadioGroup
                                        onChange={field.onChange}
                                        defaultValue={field.value}
                                    >
                                        <div className="flex items-center gap-2">
                                            <RadioGroupItem
                                                value="artist_code"
                                                id="artist_code"
                                            />
                                            <Label htmlFor="artist_code">
                                                Artist Code
                                            </Label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <RadioGroupItem
                                                value="twitter"
                                                id="twitter"
                                            />
                                            <Label htmlFor="twitter">Twitter</Label>
                                        </div>
                                    </RadioGroup>
                                )}
                            />
                        </motion.div>
                    )}

                    {currentStep === 2 && (
                        <motion.div
                            initial={{ x: delta >= 0 ? '50%' : '-50%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ duration: 0.3, east: 'easeInOut' }}
                        >
                            <div className="flex flex-col">
                                {form.getValues('verification_method') ===
                                    'artist_code' && (
                                    <div className="flex w-full flex-col gap-5">
                                        <div className="flex flex-col items-center justify-center gap-5">
                                            <NemuImage
                                                src={'/nemu/sparkles.png'}
                                                alt="Nemu with a form"
                                                width={200}
                                                height={200}
                                            />
                                            <h2 className="card-title">
                                                Just one more step!
                                            </h2>
                                            <p>
                                                Just paste the artist code you received
                                                into the box below and we'll validate it
                                                for you and you can start your journey!
                                            </p>
                                        </div>
                                        <div className="divider"></div>
                                        <div className="form-control">
                                            <FormField
                                                control={form.control}
                                                name="artist_code"
                                                render={({ field }) => (
                                                    <FormItem className="form-control">
                                                        <FormLabel className="label">
                                                            Artist Code
                                                        </FormLabel>
                                                        <Input
                                                            placeholder="Paste Code Here!"
                                                            {...field}
                                                        />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </div>
                                )}
                                {form.getValues('verification_method') === 'twitter' && (
                                    <div className="flex flex-col items-center justify-center gap-5">
                                        <NemuImage
                                            src={'/nemu/sparkles.png'}
                                            alt="Nemu Excited"
                                            width={200}
                                            height={200}
                                        />
                                        <h2 className="card-title">
                                            Just one more step!
                                        </h2>
                                        <p>
                                            Go ahead and hit that submit button and tweet
                                            @zedsoftworks with the tags #JOINNEMU and
                                            #NEMUART and an art piece that you'd like to
                                            show off (it doesn't have to be recent).
                                            Please note that we only have to verify that
                                            you're the artist that submited the request.
                                            ANY and ALL art is welcome on nemu!
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                    <div className="divider"></div>
                    <div className="flex w-full justify-between">
                        <Button
                            className="disabled:btn-outline disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={currentStep === 0}
                            onClick={() => Prev()}
                        >
                            <ChevronLeftIcon className="h-6 w-6" />
                        </Button>

                        <Button onClick={async () => await Next()}>
                            {currentStep === 2 ? (
                                verificationMutation.isPending ? (
                                    <span className="loading loading-spinner"></span>
                                ) : (
                                    'Submit'
                                )
                            ) : (
                                <ChevronRightIcon className="h-6 w-6" />
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    )
}
