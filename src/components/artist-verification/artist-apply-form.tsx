'use client'

import * as z from 'zod'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Session } from 'next-auth'
import { Form, FormField } from '~/components/ui/form'
import { api } from '~/trpc/react'
import { useState } from 'react'

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

interface VerificationMethodInterface {
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
    artist_code_used: z.boolean(),
    artist_code: z.string().optional()
})

type VerificationSchemaType = z.infer<typeof verificationSchema>

export default function ArtistApplyForm({ session }: { session: Session }) {
    const [submitting, setSubmitting] = useState(false)
    const [previousStep, setPreviousStep] = useState(0)
    const [currentStep, setCurrentStep] = useState(0)
    const delta = currentStep - previousStep

    const codeCheckMutation = api.verification.get_artist_code.useMutation()
    const handleExistsMutation = api.verification.handle_exists.useMutation()
    const verificationMutation = api.verification.set_verification.useMutation({
        onSuccess: () => {}
    })

    const form = useForm<VerificationSchemaType>({
        resolver: zodResolver(verificationSchema),
        mode: 'onSubmit'
    })

    function ProcessForm(values: VerificationSchemaType) {}

    type FieldName = keyof VerificationSchemaType

    async function Next() {
        const fields = steps[currentStep].fields
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

        if (currentStep === 2 && form.getValues('artist_code_used')) {
            // const toast_id = toast.loading('Checking artist code', { theme: 'dark' })
            const res = await codeCheckMutation.mutateAsync(form.getValues('artist_code')!)

            if (!res.success) {
                // toast.update(toast_id, {
                //     isLoading: false,
                //     type: 'error',
                //     render: 'Artist code invalid!',
                //     autoClose: 5000
                //})

                form.setError(
                    'artist_code',
                    { message: 'Must have a valid artist code' },
                    { shouldFocus: true }
                )

                return
            }

            // toast.update(toast_id, {
            //     isLoading: false,
            //     type: 'success',
            //     render: 'Artist code valid!',
            //     autoClose: 5000
            // })
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
        <Form {...form}>
            <form
                className="flex flex-col gap-5 w-full"
                onSubmit={form.handleSubmit(ProcessForm)}
            ></form>
        </Form>
    )
}

// export default function ArtistApplyForm() {
//     const { data: session } = useSession()

//     const codeCheckMutation = api.verification.get_artist_code.useMutation()
//     const handleExistsMutation = api.verification.handle_exists.useMutation()
//     const verificationMutation = api.verification.set_verification.useMutation({
//         onSuccess: () => {
//             setSubmitting(false)
//             // toast('Verification submitted!', { theme: 'dark', type: 'success' })
//         },
//         onError: (error) => {
//             // toast(error.message, { theme: 'dark', type: 'success' })
//         }
//     })

//     const [submitting, setSubmitting] = useState(false)
//     const [previousStep, setPreviousStep] = useState(0)
//     const [currentStep, setCurrentStep] = useState(0)
//     const delta = currentStep - previousStep

//     const {
//         trigger,
//         control,
//         register,
//         formState: { errors },
//         getValues,
//         setValue,
//         handleSubmit,
//         setError
//     } = useForm<VerificationSchemaType>({
//         resolver: zodResolver(verificationSchema),
//         mode: 'onSubmit'
//     })

//     type FieldName = keyof VerificationSchemaType

//     function ProcessForm(data: VerificationSchemaType) {
//         setSubmitting(true)

//         verificationMutation.mutate({
//             location: data.location,
//             requested_handle: data.requested_handle,
//             artist_code: data.artist_code || undefined,
//             method: data.artist_code_used
//                 ? VerificationMethod.Code
//                 : VerificationMethod.Twitter,
//             twitter: data.twitter_url,
//             website: data.website_url,
//             username: session?.user.id!
//         })
//     }

//     async function Next() {
//         const fields = steps[currentStep].fields
//         const output = await trigger(fields as FieldName[], { shouldFocus: true })

//         if (!output) return

//         if (currentStep === 0) {
//             const res = await handleExistsMutation.mutateAsync(
//                 getValues('requested_handle')
//             )
//             if (res.exists) {
//                 setError(
//                     'requested_handle',
//                     { message: 'Oh Nyo! The handle you requested is already taken!' },
//                     { shouldFocus: true }
//                 )

//                 return
//             }
//         }

//         if (currentStep === 2 && getValues('artist_code_used')) {
//             // const toast_id = toast.loading('Checking artist code', { theme: 'dark' })
//             const res = await codeCheckMutation.mutateAsync(getValues('artist_code')!)

//             if (!res.success) {
//                 // toast.update(toast_id, {
//                 //     isLoading: false,
//                 //     type: 'error',
//                 //     render: 'Artist code invalid!',
//                 //     autoClose: 5000
//                 })

//                 setError(
//                     'artist_code',
//                     { message: 'Must have a valid artist code' },
//                     { shouldFocus: true }
//                 )

//                 return
//             }

//             // toast.update(toast_id, {
//             //     isLoading: false,
//             //     type: 'success',
//             //     render: 'Artist code valid!',
//             //     autoClose: 5000
//             // })
//         }

//         if (currentStep === 2) {
//             await handleSubmit(ProcessForm)()

//             return
//         }

//         if (currentStep < steps.length - 1) {
//             setPreviousStep(currentStep)
//             setCurrentStep((step) => step + 1)
//         }
//     }

//     function Prev() {
//         if (currentStep > 0) {
//             setPreviousStep(currentStep)
//             setCurrentStep((step) => step - 1)
//         }
//     }

//     function ConvertIconToReact(icon: Method) {
//         switch (icon) {
//             case Method.Twitter:
//                 return <FontAwesomeIcon className="w-10 h-10" icon={faXTwitter} />
//             case Method.Email:
//                 return <MailIcon className="w-10 h-10" />
//             case Method.ArtistCode:
//                 return <CodeIcon className="w-10 h-10" />
//         }
//     }

//     return (
//         <div className="flex flex-col w-full gap-5">
//             <ul className="steps">
//                 {steps.map((step, i) => (
//                     <li
//                         className={cn(
//                             'step before:transition-all before:duration-150 after:transition-all after:duration-150',
//                             currentStep < i
//                                 ? 'before:!bg-base-100 after:!bg-base-100'
//                                 : 'before:!bg-primary after:!bg-primary'
//                         )}
//                     >
//                         {step.name}
//                     </li>
//                 ))}
//             </ul>
//             <div className="divider"></div>
//             <form
//                 className="flex flex-col gap-5 w-full"
//                 onSubmit={handleSubmit(ProcessForm)}
//             >
//                 {currentStep == 0 && (
//                     <motion.div
//                         initial={{ x: delta >= 0 ? '50%' : '-50%', opacity: 0 }}
//                         animate={{ x: 0, opacity: 1 }}
//                         transition={{ duration: 0.3, east: 'easeInOut' }}
//                     >
//                         <TextField
//                             label="Requested Handle*"
//                             placeholder="@username"
//                             error={errors.requested_handle ? true : false}
//                             errorMessage={errors.requested_handle?.message}
//                             {...register('requested_handle')}
//                         />
//                         <TextField
//                             label="Twitter URL*"
//                             placeholder="https://twitter.com/username"
//                             error={errors.twitter_url ? true : false}
//                             errorMessage={errors.twitter_url?.message}
//                             {...register('twitter_url')}
//                         />
//                         <TextField
//                             label="Website"
//                             placeholder="https://myawesome.portfolio"
//                             error={errors.website_url ? true : false}
//                             errorMessage={errors.website_url?.message}
//                             {...register('website_url')}
//                         />
//                         <Controller
//                             name="location"
//                             control={control}
//                             render={({ field }) => (
//                                 <div className="form-control">
//                                     <label className="label">Location*: </label>
//                                     <CountryDropdown
//                                         value={getValues('location')}
//                                         classes={cn(
//                                             'select w-full',
//                                             errors.location ? 'select-error' : ''
//                                         )}
//                                         onChange={(value) => field.onChange(value)}
//                                     />
//                                     {errors.location && (
//                                         <label className="label text-error">
//                                             {errors.location?.message}
//                                         </label>
//                                     )}
//                                     <p className="text-base-content/80 italic mt-5">
//                                         Note: Only Artists located inside of the U.S. can
//                                         get verified as of right now. We are working on
//                                         including more countries in the future!
//                                     </p>
//                                 </div>
//                             )}
//                         />
//                     </motion.div>
//                 )}

//                 {currentStep == 1 && (
//                     <motion.div
//                         initial={{ x: delta >= 0 ? '50%' : '-50%', opacity: 0 }}
//                         animate={{ x: 0, opacity: 1 }}
//                         transition={{ duration: 0.3, east: 'easeInOut' }}
//                     >
//                         <Controller
//                             name="verification_method"
//                             control={control}
//                             render={({ field }) => (
//                                 <RadioGroup
//                                     value={getValues('verification_method')}
//                                     onChange={(value) => {
//                                         setValue(
//                                             'artist_code_used',
//                                             value === 'artist_code'
//                                         )
//                                         field.onChange(value)
//                                     }}
//                                 >
//                                     <RadioGroup.Label className="sr-only">
//                                         Verification Method
//                                     </RadioGroup.Label>
//                                     <div className="space-y-2">
//                                         {methods.map((verification) => (
//                                             <RadioGroup.Option
//                                                 key={verification.name}
//                                                 value={verification.id}
//                                                 className={({ active, checked }) =>
//                                                     `${
//                                                         active
//                                                             ? 'ring-2 ring-white ring-opacity-60 ring-offset-2 ring-offset-primary'
//                                                             : ''
//                                                     }
//                                                 ${
//                                                     checked
//                                                         ? 'bg-primary bg-opacity-75 text-white'
//                                                         : 'bg-charcoal'
//                                                 }
//                                                 relative flex cursor-pointer rounded-3xl px-5 py-4 shadown-md focus:outline-none`
//                                                 }
//                                             >
//                                                 {({ active, checked }) => (
//                                                     <>
//                                                         <div className="flex w-full justify-center">
//                                                             <div className="flex flex-col items-center">
//                                                                 <RadioGroup.Label
//                                                                     as="p"
//                                                                     className={`font-medium my-5 ${checked ? 'text-white' : 'text-white/40'}`}
//                                                                 >
//                                                                     {ConvertIconToReact(
//                                                                         verification.method
//                                                                     )}
//                                                                 </RadioGroup.Label>
//                                                                 <RadioGroup.Description
//                                                                     as="p"
//                                                                     className={`mb-5`}
//                                                                 >
//                                                                     {verification.name}
//                                                                 </RadioGroup.Description>
//                                                             </div>
//                                                         </div>
//                                                         {checked && (
//                                                             <div className="shrink-0 text-white absolute right-5 top-14">
//                                                                 <CheckCircleIcon className="h-10 w-10" />
//                                                             </div>
//                                                         )}
//                                                     </>
//                                                 )}
//                                             </RadioGroup.Option>
//                                         ))}
//                                     </div>
//                                 </RadioGroup>
//                             )}
//                         />
//                     </motion.div>
//                 )}

//                 {currentStep === 2 && (
//                     <motion.div
//                         initial={{ x: delta >= 0 ? '50%' : '-50%', opacity: 0 }}
//                         animate={{ x: 0, opacity: 1 }}
//                         transition={{ duration: 0.3, east: 'easeInOut' }}
//                     >
//                         <div className="flex flex-col">
//                             {getValues('verification_method') === 'artist_code' && (
//                                 <div className="flex flex-col w-full gap-5">
//                                     <div className="flex flex-col justify-center items-center gap-5">
//                                         <NemuImage
//                                             src={'/nemu/sparkles.png'}
//                                             alt="Nemu with a form"
//                                             width={200}
//                                             height={200}
//                                         />
//                                         <h2 className="card-title">
//                                             Just one more step!
//                                         </h2>
//                                         <p>
//                                             Just paste the artist code you received into
//                                             the box below and we'll validate it for you
//                                             and you can start your journey!
//                                         </p>
//                                     </div>
//                                     <div className="divider"></div>
//                                     <div className="form-control">
//                                         <TextField
//                                             label="Artist Code"
//                                             placeholder="Paste Code Here!"
//                                             error={errors.artist_code ? true : false}
//                                             errorMessage={errors.artist_code?.message}
//                                             {...register('artist_code')}
//                                         />
//                                     </div>
//                                 </div>
//                             )}
//                             {getValues('verification_method') === 'twitter' && (
//                                 <div className="flex flex-col justify-center items-center gap-5">
//                                     <NemuImage
//                                         src={'/nemu/sparkles.png'}
//                                         alt="Nemu Excited"
//                                         width={200}
//                                         height={200}
//                                     />
//                                     <h2 className="card-title">Just one more step!</h2>
//                                     <p>
//                                         Go ahead and hit that submit button and tweet
//                                         @zedsoftworks with the tags #JOINNEMU and #NEMUART
//                                         and an art piece that you'd like to show off (it
//                                         doesn't have to be recent). Please note that we
//                                         only have to verify that you're the artist that
//                                         submited the request. ANY and ALL art is welcome
//                                         on nemu!
//                                     </p>
//                                 </div>
//                             )}
//                         </div>
//                     </motion.div>
//                 )}
//             </form>
//             <div className="divider"></div>
//             <div className="flex justify-between w-full">
//                 <button
//                     className="btn btn-outline disabled:btn-outline disabled:opacity-60 disabled:cursor-not-allowed"
//                     type="button"
//                     disabled={currentStep === 0}
//                     onClick={() => Prev()}
//                 >
//                     <ChevronLeftIcon className="w-6 h-6" />
//                 </button>

//                 <button
//                     className="btn btn-primary"
//                     type="button"
//                     onClick={async () => await Next()}
//                 >
//                     {currentStep === 2 ? (
//                         submitting && <span className="loading loading-spinner"></span>
//                     ) : (
//                         <ChevronRightIcon className="w-6 h-6" />
//                     )}
//                 </button>
//             </div>
//         </div>
//     )
// }
