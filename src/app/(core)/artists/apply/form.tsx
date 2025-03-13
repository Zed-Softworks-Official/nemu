'use client'

import { Input } from '~/app/_components/ui/input'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/app/_components/ui/form'
import { RadioGroup, RadioGroupItem } from '~/app/_components/ui/radio-group'
import { allCountries } from 'country-region-data'
import { Label } from '~/app/_components/ui/label'
import { verificationMethods, type VerificationMethod } from '~/lib/types'

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
} from '~/app/_components/ui/select'
import { Separator } from '~/app/_components/ui/separator'
import { Button } from '~/app/_components/ui/button'
import { api } from '~/trpc/react'
import { useRouter } from 'next/navigation'

const schema = z.object({
    requested_handle: z.string(),
    twitter: z.string().url().optional(),
    website: z.string().url().optional(),
    location: z.string().optional(),
    method: z.enum(verificationMethods),
    artist_code: z.string().optional()
})

type SchemaType = z.infer<typeof schema>

export default function ArtistApplyForm() {
    const router = useRouter()

    const verifyArtist = api.artistVerification.verifyArtist.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Submitting your application')

            return { toast_id }
        },
        onSuccess: (res, _, context) => {
            toast.success('Application submitted successfully!', {
                id: context.toast_id
            })

            router.push(res.route)
        },
        onError: (e, __, context) => {
            toast.error(e.message, {
                id: context?.toast_id
            })
        }
    })

    const form = useForm<SchemaType>({
        resolver: zodResolver(schema),
        mode: 'onSubmit',
        defaultValues: {
            requested_handle: '',
            twitter: '',
            website: '',
            location: '',
            artist_code: ''
        }
    })

    async function processForm(data: SchemaType) {
        verifyArtist.mutate({
            requestedHandle: data.requested_handle,
            method: data.method,
            artistCode: data.method === 'artist_code' ? data.artist_code : undefined,
            location: data.location,
            twitter: data.twitter,
            website: data.website
        })
    }

    return (
        <Form {...form}>
            <form
                className="flex w-full flex-col gap-5"
                onSubmit={form.handleSubmit(processForm)}
            >
                <FormField
                    control={form.control}
                    name="requested_handle"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Requested Handle:</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="@handle"
                                    className="bg-background"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="twitter"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Twitter URL:</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="https://twitter.com/username"
                                    className="bg-background"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Website URL:</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="https://myawesome.portfolio"
                                    className="bg-background"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Location:</FormLabel>
                            <FormControl>
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
                                            <SelectItem
                                                key={country[1]}
                                                value={country[0]}
                                            >
                                                {country[0]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormControl>
                            <FormMessage />
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
                            <FormControl>
                                <RadioGroup name="method" onValueChange={field.onChange}>
                                    <div className="flex items-center gap-2">
                                        <RadioGroupItem
                                            value="artist_code"
                                            id="artist_code"
                                        />
                                        <Label htmlFor="artist_code">Artist Code</Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <RadioGroupItem value="twitter" id="twitter" />
                                        <Label htmlFor="twitter">Twitter</Label>
                                    </div>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
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
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="NEMU-XXXX-XXX-XXXX"
                                            className="bg-background"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </VerificationStep>
                </div>
                <Separator />
                <Button
                    type="submit"
                    disabled={
                        form.watch('method') === undefined || verifyArtist.isPending
                    }
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

    if (props.verificationMethod === 'artist_code') {
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
