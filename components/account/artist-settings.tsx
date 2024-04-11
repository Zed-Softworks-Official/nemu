'use client'

import * as z from 'zod'

import { Artist } from '@prisma/client'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import TextField from '../form/text-input'
import MarkdownEditor from '../form/markdown-text-area'
import CheckboxField from '../form/checkbox-input'
import { CountryDropdown } from 'react-country-region-selector'
import { api } from '@/core/api/react'
import { useState } from 'react'
import { Id, toast } from 'react-toastify'

const artistSchema = z.object({
    about: z.string(),
    location: z.string(),
    terms: z.string(),

    tipJarUrl: z.string().url('Needs to be a valid url!').optional().or(z.literal('')),
    automatedMessageEnabled: z.boolean(),
    automatedMessage: z.string().optional()
})

export type ArtistSchemaType = z.infer<typeof artistSchema>

export default function ArtistSettings({ artist }: { artist: Artist }) {
    const [toastId, setToastId] = useState<Id | undefined>(undefined)
    const mutation = api.artist.update_artist.useMutation({
        onSuccess: () => {
            if (!toastId) return

            toast.update(toastId, {
                render: 'Artist Information Updated!',
                autoClose: 5000,
                type: 'success',
                isLoading: false
            })
        },

        onError: (e) => {
            if (!toastId) return

            toast.update(toastId, {
                render: e.message,
                autoClose: 5000,
                type: 'error',
                isLoading: false
            })
        }
    })

    const form = useForm<ArtistSchemaType>({
        resolver: zodResolver(artistSchema),
        defaultValues: {
            about: artist.about,
            location: artist.location,
            terms: artist.terms,
            tipJarUrl: artist.tipJarUrl || undefined,
            automatedMessage: artist.automatedCommissionMessage || undefined,
            automatedMessageEnabled: artist.automatedMessageEnabled
        },
        mode: 'onBlur'
    })

    function ProcessForm(values: ArtistSchemaType) {
        const toast_id = toast.loading('Updating Artist Information', { theme: 'dark' })
        setToastId(toast_id)

        mutation.mutate(values)
    }

    return (
        <form className="flex flex-col gap-5" onBlur={form.handleSubmit(ProcessForm)}>
            <Controller
                name="location"
                control={form.control}
                render={({ field }) => (
                    <div className="form-control">
                        <label className="label">Location:</label>
                        <CountryDropdown
                            value={field.value}
                            onChange={field.onChange}
                            classes={'select'}
                            disabled={mutation.isPending}
                        />
                    </div>
                )}
            />
            <Controller
                name="about"
                control={form.control}
                render={({ field }) => (
                    <MarkdownEditor
                        label="About"
                        markdown={field.value}
                        placeholder="Tell us about yourself"
                        input_name={field.name}
                        change_event={field.onChange}
                    />
                )}
            />
            <Controller
                name="terms"
                control={form.control}
                render={({ field }) => (
                    <MarkdownEditor
                        label="Terms & Conditions"
                        markdown={field.value}
                        placeholder="Tell us about your terms and conditions"
                        input_name={field.name}
                        change_event={field.onChange}
                    />
                )}
            />
            <TextField
                label="Tip Jar URL"
                {...form.register('tipJarUrl')}
                disabled={mutation.isPending}
                error={form.formState.errors.tipJarUrl ? true : false}
                errorMessage={form.formState.errors.tipJarUrl?.message}
                placeholder="https://mytip.jar"
            />
            <div className="card bg-base-200 shadow-xl">
                <div className="card-body">
                    <CheckboxField
                        label="Automated Messages Enabled"
                        disabled={mutation.isPending}
                        {...form.register('automatedMessageEnabled')}
                    />
                    <TextField
                        label="Automated Message"
                        {...form.register('automatedMessage')}
                        disabled={mutation.isPending}
                        placeholder={`Hey!, I'll be right with you in a moment!`}
                    />
                </div>
            </div>
        </form>
    )
}
