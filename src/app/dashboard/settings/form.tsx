'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { allCountries } from 'country-region-data'

import { api } from '~/trpc/react'
import Loading from '~/components/ui/loading'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/components/ui/form'
import { chargeMethods, SocialAgent } from '~/lib/structures'
import { Textarea } from '~/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/components/ui/select'
import { Input } from '~/components/ui/input'
import { useNemuUploadThing } from '~/components/files/uploadthing-context'
import { NemuSingleDropzone } from '~/components/files/nemu-uploadthing'
import { Label } from '~/components/ui/label'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { Save } from 'lucide-react'
import { toast } from 'sonner'

const schema = z.object({
    about: z.string().min(1, { message: 'About is required' }),
    location: z.string().min(1, { message: 'Location is required' }),
    terms: z.string().min(1, { message: 'Terms is required' }),
    tip_jar_url: z.string().min(1, { message: 'Tip jar URL is required' }).nullable(),
    socials: z.array(
        z.object({
            agent: z.nativeEnum(SocialAgent),
            url: z.string().url()
        })
    ),
    default_charge_method: z.enum(chargeMethods)
})

type SettingsForm = z.infer<typeof schema>

export function SettingsForm() {
    const [pending, setPending] = useState(false)
    const { uploadImages, images } = useNemuUploadThing()
    const { data: settings, isLoading } = api.artist.get_artist_settings.useQuery()

    const updateSettings = api.artist.set_artist_settings.useMutation()

    const form = useForm<SettingsForm>({
        resolver: zodResolver(schema),
        mode: 'onSubmit',
        defaultValues: {
            about: '',
            location: '',
            terms: '',
            tip_jar_url: '',
            socials: [],
            default_charge_method: 'in_full'
        }
    })

    const process_form = async (values: SettingsForm) => {
        setPending(true)

        const toast_id = toast.loading('Saving...')
        let header_image_key: string | undefined

        if (images.length != 0) {
            const res = await uploadImages()
            if (!res) {
                toast.error('Failed to upload image', {
                    id: toast_id
                })
                return
            }

            header_image_key = res[0]?.key ?? undefined
        }

        await updateSettings.mutateAsync(
            {
                ...values,
                header_image_key
            },
            {
                onError: (e) => {
                    toast.error(e.message, {
                        id: toast_id
                    })
                },
                onSuccess: () => {
                    toast.success('Settings updated', {
                        id: toast_id
                    })
                }
            }
        )

        setPending(false)
    }

    useEffect(() => {
        if (settings) {
            form.reset(settings, { keepDefaultValues: false })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings])

    if (isLoading) {
        return <Loading />
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(process_form)}
                className="flex flex-col gap-5"
            >
                <div className="mt-3 flex items-center justify-between">
                    <h1 className="text-3xl font-bold">Aritst Settings</h1>
                    <Button type="submit" disabled={pending}>
                        <Save className="h-6 w-6" />
                        Save
                    </Button>
                </div>
                <Separator className="mb-5" />
                <div className="flex flex-col gap-2">
                    <Label>Header Photo:</Label>
                    <NemuSingleDropzone />
                </div>
                <FormField
                    control={form.control}
                    name="about"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>About:</FormLabel>
                            <FormControl>
                                <Textarea
                                    {...field}
                                    placeholder="I once ruled the world"
                                    className="resize-none bg-background-secondary"
                                    rows={6}
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
                            <Select
                                value={field.value || undefined}
                                onValueChange={(value) => {
                                    if (value) {
                                        field.onChange(value)
                                    }
                                }}
                            >
                                <FormControl>
                                    <SelectTrigger className="bg-background-secondary">
                                        <SelectValue placeholder="Select a country" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {allCountries.map((country) => (
                                        <SelectItem key={country[1]} value={country[0]}>
                                            {country[0]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="terms"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Terms:</FormLabel>
                            <FormControl>
                                <Textarea
                                    {...field}
                                    placeholder="Please feed Nemu"
                                    className="resize-none bg-background-secondary"
                                    rows={6}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="default_charge_method"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Default Charge Method:</FormLabel>
                            <FormControl>
                                <Select
                                    value={field.value}
                                    onValueChange={field.onChange}
                                >
                                    <SelectTrigger className="bg-background-secondary">
                                        <SelectValue placeholder="Select a payment method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="in_full">In Full</SelectItem>
                                        <SelectItem value="down_payment">
                                            Down Payment
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="tip_jar_url"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Tip Jar URL:</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="https://www.patreon.com/nemu"
                                    className="bg-background-secondary"
                                    value={field.value ?? ''}
                                    onChange={(e) =>
                                        field.onChange(e.currentTarget.value)
                                    }
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="socials"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Socials:</FormLabel>
                            {[0, 1, 2].map((index) => (
                                <FormControl key={index}>
                                    <Input
                                        name={`socials.${index}.url`}
                                        value={field.value[index]?.url ?? ''}
                                        onChange={(e) => {
                                            const url = e.target.value

                                            // Determine social agent type
                                            let agent = SocialAgent.Website
                                            if (
                                                url.toLowerCase().includes('twitter') ||
                                                url.toLowerCase().includes('x.com')
                                            ) {
                                                agent = SocialAgent.Twitter
                                            } else if (
                                                url.toLowerCase().includes('pixiv')
                                            ) {
                                                agent = SocialAgent.Pixiv
                                            }

                                            // Get current socials array
                                            const currentSocials =
                                                form.getValues('socials')

                                            // Create new array with enough elements
                                            const paddedSocials = [...currentSocials]
                                            while (paddedSocials.length <= index) {
                                                paddedSocials.push({
                                                    url: '',
                                                    agent: SocialAgent.Website
                                                })
                                            }

                                            // Update specific index
                                            paddedSocials[index] = {
                                                url,
                                                agent
                                            }

                                            form.setValue('socials', paddedSocials)
                                        }}
                                        className="mb-2 bg-background-secondary"
                                        placeholder={`Social media URL ${index + 1}`}
                                    />
                                </FormControl>
                            ))}
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </form>
        </Form>
    )
}
