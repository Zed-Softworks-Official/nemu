'use client'

import * as z from 'zod'

import { Artist } from '@prisma/client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Textarea } from '~/components/ui/textarea'
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem
} from '~/components/ui/select'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'

import Container from '~/components/ui/container'
import { Button } from '~/components/ui/button'
import { SaveIcon } from 'lucide-react'

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
    const form = useForm<ArtistSchemaType>({
        resolver: zodResolver(artistSchema),
        mode: 'onSubmit'
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
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Location" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="United States">
                                        United States
                                    </SelectItem>
                                    <SelectItem value="Not United States">
                                        Not United States
                                    </SelectItem>
                                </SelectContent>
                            </Select>
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
