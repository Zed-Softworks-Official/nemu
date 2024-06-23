'use client'

import { z } from 'zod'

import { UserProfile } from '@clerk/nextjs'
import { BrushIcon, SaveIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { UploadDropzone } from '~/components/files/uploadthing'
import { Textarea } from '~/components/ui/textarea'
import { toast } from 'sonner'
import type { artists } from '~/server/db/schema'
import type { InferSelectModel } from 'drizzle-orm'
import { api } from '~/trpc/react'
import { useState } from 'react'
import SelectCountries from '~/components/ui/select-countries'
import SocialsList from './socials-list'
import type { SocialAccount } from '~/core/structures'

const artistSchema = z.object({
    about: z.string().max(256),
    location: z.string(),
    terms: z.string(),

    tipJarUrl: z.string().url('Needs to be a valid url!').optional().or(z.literal('')),
    automatedMessageEnabled: z.boolean().default(false),
    automatedMessage: z.string().optional(),
    socials: z.array(z.object({ agent: z.string().optional(), url: z.string() }))
})

type ArtistSchemaType = z.infer<typeof artistSchema>

type Props = {
    artist?: InferSelectModel<typeof artists>
}

export default function NemuUserProfile(props: Props) {
    if (!props.artist) {
        return <UserProfile path="/u/account" />
    }

    return (
        <UserProfile path="/u/account" routing="path">
            <UserProfile.Page
                label="Artist"
                labelIcon={<BrushIcon className="h-4 w-4" />}
                url="artist"
            >
                <ArtistSettings artist={props.artist} />
            </UserProfile.Page>
        </UserProfile>
    )
}

function ArtistSettings({ artist }: Props) {
    const [toastId, setToastId] = useState<string | number | undefined>()

    const mutation = api.artist.set_artist.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Updating Artist'))
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Artist Updated', {
                id: toastId
            })
        },
        onError: (e) => {
            if (!toastId) return

            toast.error(e.message, {
                id: toastId
            })
        }
    })

    const form = useForm<ArtistSchemaType>({
        resolver: zodResolver(artistSchema),
        mode: 'onSubmit',
        defaultValues: artist
            ? {
                  about: artist.about,
                  location: artist.location,
                  terms: artist.terms,
                  tipJarUrl: artist.tip_jar_url ?? undefined,
                  automatedMessageEnabled: artist.automated_message_enabled ?? false,
                  automatedMessage: artist.automated_message ?? undefined,
                  socials: artist.socials
              }
            : undefined
    })

    function ProcessForm(values: ArtistSchemaType) {
        console.log(values)

        mutation.mutate({
            artist_id: artist!.id,
            ...values
        })
    }

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-5"
                onSubmit={form.handleSubmit(ProcessForm)}
            >
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
                <FormField
                    control={form.control}
                    name="about"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">About:</FormLabel>
                            <Textarea
                                placeholder="Your Bio Here"
                                {...field}
                                className="resize-none"
                                rows={8}
                            />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="terms"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Terms & Conditions:</FormLabel>
                            <Textarea
                                placeholder="Your Terms and Conditions"
                                {...field}
                                className="resize-none"
                                rows={8}
                            />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="tipJarUrl"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Tip Jar URL:</FormLabel>
                            <Input placeholder="Tip Jar URL" {...field} />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="socials"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <SocialsList
                                socials={field.value as SocialAccount[]}
                                onSocialsChange={(socials) => field.onChange(socials)}
                            />
                        </FormItem>
                    )}
                />
                {/* TODO: Add Automated Messages */}
                {/* <div className="card bg-base-200 shadow-xl">
                    <div className="card-body">
                        <FormField
                            control={form.control}
                            name="automatedMessageEnabled"
                            render={({ field }) => (
                                <FormItem className="flex items-center justify-between">
                                    <FormLabel
                                        htmlFor={field.name}
                                        className="cursor-pointer"
                                    >
                                        Automated Messages Enabled:
                                    </FormLabel>
                                    <Switch
                                        id={field.name}
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="automatedMessage"
                            render={({ field }) => (
                                <FormItem className="form-control">
                                    <FormLabel className="label">
                                        Automated Message:
                                    </FormLabel>
                                    <Input
                                        placeholder="Hey!, I'll be right with you in a moment!"
                                        {...field}
                                    />
                                </FormItem>
                            )}
                        />
                    </div>
                </div> */}

                <div className="form-control">
                    <label className="label">Header Photo Upload</label>
                    <UploadDropzone
                        className="w-full ut-button:bg-primary ut-button:transition-all ut-button:duration-200 ut-button:ease-in-out ut-button:active:scale-95 ut-allowed-content:italic ut-allowed-content:text-base-content/80 ut-label:text-base-content ut-ready:border-2 ut-ready:border-base-content/60 ut-ready:bg-base-100 ut-ready:transition-all ut-ready:duration-200 ut-ready:ease-in-out ut-ready:hover:border-primary"
                        endpoint="headerPhotoUploader"
                        onClientUploadComplete={() => {
                            toast.success('Header photo updated!')
                        }}
                    />
                </div>
                <div className="flex justify-end">
                    <Button type="submit" className="btn-wide">
                        <SaveIcon className="h-6 w-6" />
                        Save
                    </Button>
                </div>
            </form>
        </Form>
    )
}
