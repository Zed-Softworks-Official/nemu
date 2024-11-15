'use client'

import { Input } from '~/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group'
import { allCountries } from 'country-region-data'
import { Label } from '~/components/ui/label'
import { VerificationMethod } from '~/core/structures'

import { toast } from 'sonner'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/components/ui/select'
import { Separator } from '~/components/ui/separator'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const schema = z.object({
    requested_handle: z.string(),
    twitter: z.string().url().optional(),
    website: z.string().url().optional(),
    location: z.string().optional(),
    method: z.enum([VerificationMethod.Code, VerificationMethod.Twitter]),
    artist_code: z.string().optional()
})

type SchemaType = z.infer<typeof schema>

export default function ArtistApplyForm() {
    const [toastId, setToastId] = useState<string | number | null>(null)
    const router = useRouter()

    const mutation = api.artist_verification.verify_artist.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Submitting your application'))
        },
        onSuccess: (res) => {
            if (!toastId) return

            toast.success('Application submitted successfully!', {
                id: toastId
            })

            router.push(res.route)
        },
        onError: () => {
            if (!toastId) return

            toast.error('Something went wrong', {
                id: toastId
            })
        }
    })

    const form = useForm<SchemaType>({
        resolver: zodResolver(schema),
        mode: 'onSubmit'
    })

    async function process_form(data: SchemaType) {
        console.log(data)
    }

    return (
        <Form {...form}>
            <form
                className="flex w-full flex-col gap-5"
                onSubmit={form.handleSubmit(process_form)}
            >
                <FormField
                    control={form.control}
                    name="requested_handle"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Requested Handle:</FormLabel>
                            <Input
                                {...field}
                                placeholder="@handle"
                                className="bg-background"
                            />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="twitter"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Twitter URL:</FormLabel>
                            <Input
                                {...field}
                                placeholder="https://twitter.com/username"
                                className="bg-background"
                            />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Website URL:</FormLabel>
                            <Input
                                {...field}
                                placeholder="https://myawesome.portfolio"
                                className="bg-background"
                            />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Location:</FormLabel>
                            <Select
                                defaultValue={field.value}
                                onValueChange={field.onChange}
                            >
                                <FormControl>
                                    <SelectTrigger className="bg-background">
                                        <SelectValue placeholder="Select a country" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {allCountries.map((country) => (
                                        <SelectItem key={country[1]} value={country[1]}>
                                            {country[0]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}
                />
                <Separator />
                <FormField
                    control={form.control}
                    name="method"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Verification Method</FormLabel>
                            <RadioGroup name="method" onValueChange={field.onChange}>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                        value={VerificationMethod.Code}
                                        id={VerificationMethod.Code}
                                    />
                                    <Label htmlFor={VerificationMethod.Code}>
                                        Artist Code
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                        value={VerificationMethod.Twitter}
                                        id={VerificationMethod.Twitter}
                                    />
                                    <Label htmlFor={VerificationMethod.Twitter}>
                                        Twitter
                                    </Label>
                                </div>
                            </RadioGroup>
                        </FormItem>
                    )}
                />
                <Separator />
                <div className="flex min-h-40 w-full flex-col items-center justify-center">
                    <VerificationStep verificationMethod={form.watch('method')}>
                        <FormField
                            control={form.control}
                            name="artist_code"
                            render={({ field }) => (
                                <FormItem className="w-full">
                                    <FormLabel>Artist Code:</FormLabel>
                                    <Input
                                        {...field}
                                        placeholder="NEMU-XXXX-XXX-XXXX"
                                        className="bg-background"
                                    />
                                </FormItem>
                            )}
                        />
                    </VerificationStep>
                </div>
                <Separator />
                <Button
                    type="submit"
                    disabled={form.watch('method') === undefined || mutation.isPending}
                >
                    Submit
                </Button>
            </form>
        </Form>
    )
}

function VerificationStep(props: {
    verificationMethod?: VerificationMethod
    children: React.ReactNode
}) {
    if (!props.verificationMethod) return <p>Please select a verification method</p>

    if (props.verificationMethod === VerificationMethod.Code) {
        return <>{props.children}</>
    }

    return (
        <p>
            Go ahead and hit that submit button and tweet @zedsoftworks with the tags
            #JOINNEMU and #NEMUART and an art piece that you&apos;d like to show off (it
            doesn&apos;t have to be recent). Please note that we only have to verify that
            you&apos;re the artist that submited the request. ANY and ALL art is welcome
            on nemu!
        </p>
    )
}
