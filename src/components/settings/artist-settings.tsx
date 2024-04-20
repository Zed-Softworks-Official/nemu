'use client'

import * as z from 'zod'

import { Artist } from '@prisma/client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { CheckCircle2, SaveIcon } from 'lucide-react'

import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Textarea } from '~/components/ui/textarea'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'

import Container from '~/components/ui/container'
import { Button } from '~/components/ui/button'
import SelectCountries from '~/components/ui/select-countries'
import { UploadDropzone } from '~/components/files/uploadthing'
import { nemu_toast } from '~/lib/utils'
import { useTheme } from 'next-themes'

const artistSchema = z.object({
    about: z.string().max(256),
    location: z.string(),
    terms: z.string(),

    tipJarUrl: z.string().url('Needs to be a valid url!').optional().or(z.literal('')),
    automatedMessageEnabled: z.boolean(),
    automatedMessage: z.string().optional()
})

type ArtistSchemaType = z.infer<typeof artistSchema>

export default function ArtistSettings({ artist }: { artist: Artist }) {
    const { resolvedTheme } = useTheme()

    const form = useForm<ArtistSchemaType>({
        resolver: zodResolver(artistSchema),
        mode: 'onSubmit',
        defaultValues: {
            about: artist.about,
            location: artist.location,
            terms: artist.terms,
            tipJarUrl: artist.tipJarUrl ? artist.tipJarUrl : undefined,
            automatedMessageEnabled: artist.automatedMessageEnabled,
            automatedMessage: artist.automatedCommissionMessage
                ? artist.automatedCommissionMessage
                : undefined
        }
    })

    return (
        <Form {...form}>
            <form className="flex flex-col gap-5">
                <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Location:</FormLabel>
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
                            <Input placeholder="Tip Jar UR" {...field} />
                        </FormItem>
                    )}
                />
                <Container variant={'muted'}>
                    <FormField
                        control={form.control}
                        name="automatedMessageEnabled"
                        render={({ field }) => (
                            <FormItem className="flex justify-between items-center">
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
                </Container>
                <div className="form-control">
                    <label className="label">Header Photo Upload</label>
                    <UploadDropzone
                        className="ut-ready:border-2 ut-ready:border-base-content/60 ut-ready:bg-base-100 ut-ready:hover:border-primary ut-label:text-base-content ut-allowed-content:text-base-content/80 ut-allowed-content:italic ut-button:bg-primary ut-button:active:scale-95 w-full ut-button:transition-all ut-button:duration-200 ut-button:ease-in-out ut-ready:transition-all ut-ready:duration-200 ut-ready:ease-in-out"
                        endpoint="headerPhotoUploader"
                        onClientUploadComplete={() => {
                            nemu_toast('Header photo updated!', {
                                theme: resolvedTheme,
                                type: 'success'
                            })
                        }}
                    />
                </div>
                <div className="flex justify-end">
                    <Button type="submit" className="btn-wide">
                        <SaveIcon className="w-6 h-6" />
                        Save
                    </Button>
                </div>
            </form>
        </Form>
    )
}
