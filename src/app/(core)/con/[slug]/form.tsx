'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Input } from '~/components/ui/input'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/components/ui/form'
import { Button } from '~/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/components/ui/select'
import { allCountries } from 'country-region-data'
import { api } from '~/trpc/react'
import { toast } from 'sonner'

const schema = z.object({
    requestedHandle: z.string(),
    twitter: z.string().url().optional(),
    website: z.string().url().optional(),
    location: z.string()
})

type SchemaType = z.infer<typeof schema>

export default function ApplyConForm(props: { slug: string }) {
    const router = useRouter()
    const createArtist = api.artistVerification.verifyFromCon.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Registering')

            return { toast_id }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Registration Successful', {
                id: ctx.toast_id
            })

            router.push('/')
        },
        onError: (_, __, ctx) => {
            toast.error('Registration Failed', {
                id: ctx?.toast_id
            })
        }
    })

    const form = useForm<SchemaType>({
        resolver: zodResolver(schema),
        mode: 'onSubmit',
        defaultValues: {
            requestedHandle: '',
            twitter: '',
            website: '',
            location: ''
        }
    })

    async function processForm(data: SchemaType) {
        createArtist.mutate({
            ...data,
            conSlug: props.slug
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
                    name="requestedHandle"
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

                <Button
                    type="submit"
                    disabled={createArtist.isPending || createArtist.isSuccess}
                >
                    Create Artist
                </Button>
            </form>
        </Form>
    )
}
