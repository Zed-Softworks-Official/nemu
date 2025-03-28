'use client'

import { useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { allCountries } from 'country-region-data'
import { Save } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '~/trpc/react'
import Loading from '~/app/_components/ui/loading'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/app/_components/ui/form'
import { chargeMethods, type SocialAgent, socialAgents } from '~/lib/types'
import { Textarea } from '~/app/_components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/app/_components/ui/select'
import { Input } from '~/app/_components/ui/input'
import { Label } from '~/app/_components/ui/label'
import { Button } from '~/app/_components/ui/button'
import { Separator } from '~/app/_components/ui/separator'
import { UploadDropzone } from '~/app/_components/uploadthing'

const schema = z.object({
    about: z.string().min(1, { message: 'About is required' }),
    location: z.string().min(1, { message: 'Location is required' }),
    terms: z.string().min(1, { message: 'Terms is required' }),
    tipJarUrl: z.string().min(1, { message: 'Tip jar URL is required' }).nullable(),
    socials: z.array(
        z.object({
            agent: z.enum(socialAgents),
            url: z.string().url()
        })
    ),
    defaultChargeMethod: z.enum(chargeMethods)
})

type SettingsSchema = z.infer<typeof schema>

export function SettingsForm() {
    const { data: settings, isLoading } = api.artist.getArtistSettings.useQuery()

    const updateSettings = api.artist.setArtistSettings.useMutation()

    const form = useForm<SettingsSchema>({
        resolver: zodResolver(schema),
        mode: 'onSubmit',
        defaultValues: {
            about: '',
            location: '',
            terms: '',
            tipJarUrl: '',
            socials: [],
            defaultChargeMethod: 'in_full'
        }
    })

    const processForm = async (values: SettingsSchema) => {
        const toast_id = toast.loading('Saving...')

        await updateSettings.mutateAsync(
            {
                ...values
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
                onSubmit={form.handleSubmit(processForm)}
                className="flex flex-col gap-5"
            >
                <div className="mt-3 flex items-center justify-between">
                    <h1 className="text-3xl font-bold">Aritst Settings</h1>
                    <Button type="submit" disabled={updateSettings.isPending}>
                        <Save className="h-6 w-6" />
                        Save
                    </Button>
                </div>
                <Separator className="mb-5" />
                <div className="flex flex-col gap-2">
                    <Label>Header Photo:</Label>
                    <UploadDropzone
                        endpoint={'headerPhotoUploader'}
                        onClientUploadComplete={() => {
                            toast.success('Header photo upadated')
                        }}
                        onUploadError={(error) => {
                            toast.error('Failed to upload header photo', {
                                description: error.message
                            })
                        }}
                    />
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
                                    className="bg-background-secondary resize-none"
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
                                    className="bg-background-secondary resize-none"
                                    rows={6}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="defaultChargeMethod"
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
                    name="tipJarUrl"
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
                                            let agent: SocialAgent = 'website'
                                            if (
                                                url.toLowerCase().includes('twitter') ||
                                                url.toLowerCase().includes('x.com')
                                            ) {
                                                agent = 'twitter'
                                            } else if (
                                                url.toLowerCase().includes('pixiv')
                                            ) {
                                                agent = 'pixiv'
                                            }

                                            // Get current socials array
                                            const currentSocials =
                                                form.getValues('socials')

                                            // Create new array with enough elements
                                            const paddedSocials = [...currentSocials]
                                            while (paddedSocials.length <= index) {
                                                paddedSocials.push({
                                                    url: '',
                                                    agent: 'website'
                                                })
                                            }

                                            // Update specific index
                                            paddedSocials[index] = {
                                                url,
                                                agent
                                            }

                                            form.setValue('socials', paddedSocials)
                                        }}
                                        className="bg-background-secondary mb-2"
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
