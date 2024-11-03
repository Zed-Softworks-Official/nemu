'use client'

import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

import { set_artist_code } from '~/server/actions/verification'

const artistGenerationSchema = z.object({
    quantity: z.number().min(1).max(100).default(1)
})

type ArtistGenerationSchemaType = z.infer<typeof artistGenerationSchema>

export default function GenerateArtistCode() {
    const [pending, setPending] = useState(false)
    const [generatedCodes, setGeneratedCodes] = useState<string[]>([])

    const form = useForm<ArtistGenerationSchemaType>({
        resolver: zodResolver(artistGenerationSchema),
        mode: 'onSubmit',
        defaultValues: {
            quantity: 1
        }
    })

    async function ProcessForm(values: ArtistGenerationSchemaType) {
        setPending(true)

        const toast_id = toast.loading('Generating Artist Codes')

        const res = await set_artist_code(values.quantity)

        if (!res.success) {
            toast.error('Failed to generate artist codes', {
                id: toast_id
            })

            setPending(false)
            return
        }

        setGeneratedCodes(res.codes)
        setPending(false)
    }

    return (
        <div className="conatiner mx-auto flex flex-col gap-5">
            <div className="divider"></div>
            <h1 className="text-3xl font-bold">Generate Artist Code</h1>
            <h2 className="text-xl font-semibold text-base-content/80">
                Create a unique code artists to join
            </h2>
            <div className="divider"></div>
            <Form {...form}>
                <form
                    className="flex flex-col gap-5 rounded-xl bg-base-200 p-5"
                    onSubmit={form.handleSubmit(ProcessForm)}
                >
                    <FormField
                        name="quantity"
                        control={form.control}
                        render={({ field }) => (
                            <FormItem className="form-control">
                                <FormLabel className="label">Quantity:</FormLabel>
                                <Input
                                    name={field.name}
                                    onChange={(e) =>
                                        field.onChange(e.currentTarget.valueAsNumber)
                                    }
                                    placeholder="1"
                                    defaultValue={field.value}
                                    type="number"
                                    inputMode="numeric"
                                    convertToNumber={true}
                                />
                            </FormItem>
                        )}
                    />
                    <div className="flex justify-end">
                        <Button type="submit" className="btn-wide" disabled={pending}>
                            Generate
                        </Button>
                    </div>
                </form>
            </Form>
            <Card>
                <CardHeader>
                    <CardTitle>Generated Responses</CardTitle>
                </CardHeader>
                <CardContent>
                    <pre>
                        {generatedCodes.map((code) => (
                            <p key={code}>{code}</p>
                        ))}
                    </pre>
                </CardContent>
            </Card>
        </div>
    )
}
