'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { api } from '~/trpc/react'
import { toast } from 'sonner'
import { useState } from 'react'

const artistGenerationSchema = z.object({
    quantity: z.number().min(1).max(100).default(1)
})

type ArtistGenerationSchemaType = z.infer<typeof artistGenerationSchema>

export default function GenerateArtistCode() {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)
    const [generatedCodes, setGeneratedCodes] = useState<string[]>([])

    const form = useForm<ArtistGenerationSchemaType>({
        resolver: zodResolver(artistGenerationSchema),
        mode: 'onSubmit',
        defaultValues: {
            quantity: 1
        }
    })

    const mutation = api.verification.set_artist_code.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Generating Artist Codes'))
        },
        onSuccess: (res) => {
            if (!toastId) return

            toast.success('Artist Codes Generated!', {
                id: toastId
            })

            setGeneratedCodes(res)
        },
        onError: (e) => {
            if (!toastId) return

            toast.error(e.message, {
                id: toastId
            })
        }
    })

    async function ProcessForm(values: ArtistGenerationSchemaType) {
        mutation.mutate(values.quantity)
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
                        <Button
                            type="submit"
                            className="btn-wide"
                            disabled={mutation.isPending}
                        >
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
