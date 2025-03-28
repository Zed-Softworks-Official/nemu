'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { api } from '~/trpc/react'
import { Button } from '~/app/_components/ui/button'
import { Form, FormField, FormItem, FormLabel } from '~/app/_components/ui/form'
import { Input } from '~/app/_components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '~/app/_components/ui/card'
import { Separator } from '~/app/_components/ui/separator'
import Loading from '~/app/_components/ui/loading'
import { DataTable } from '~/app/_components/data-table'

const schema = z.object({
    quantity: z.number().min(1).max(100).default(1)
})

type SchemaType = z.infer<typeof schema>

export function GenerateAristCode() {
    const utils = api.useUtils()

    const [toastId, setToastId] = useState<string | number | null>(null)
    const [generatedCodes, setGeneratedCodes] = useState<string[]>([])

    const mutation = api.artistVerification.generateArtistCode.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Generating codes...'))
        },
        onSuccess: (res) => {
            if (!toastId) return
            if (!res.ok) {
                toast.error(res.error.message)
                return
            }

            setGeneratedCodes(res.data.codes)
            toast.success('Codes generated successfully', {
                id: toastId
            })

            void utils.artistVerification.getArtistCodes.invalidate()
        },
        onError: (error) => {
            if (!toastId) return

            toast.error(error.message, {
                id: toastId
            })
        }
    })

    const form = useForm<SchemaType>({
        resolver: zodResolver(schema),
        mode: 'onSubmit',
        defaultValues: {
            quantity: 1
        }
    })

    function ProcessForm(data: SchemaType) {
        mutation.mutate({ amount: data.quantity })
    }

    return (
        <div className="flex flex-col gap-2">
            <h1 className="text-xl font-bold">Generate Artist Code</h1>
            <Separator />
            <Form {...form}>
                <form
                    className="bg-background-secondary flex flex-col gap-5 rounded-xl p-5"
                    onSubmit={form.handleSubmit(ProcessForm)}
                >
                    <FormField
                        name="quantity"
                        control={form.control}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Quantity:</FormLabel>
                                <Input
                                    className="bg-background"
                                    name={field.name}
                                    onChange={(e) =>
                                        field.onChange(e.currentTarget.valueAsNumber)
                                    }
                                    placeholder="1"
                                    defaultValue={field.value}
                                    type="number"
                                    inputMode="numeric"
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
            <Card className="bg-background-secondary">
                <CardHeader>
                    <CardTitle>Generated Responses</CardTitle>
                    <Separator />
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

export function CurrentArtistCodes() {
    const { data, isLoading } = api.artistVerification.getArtistCodes.useQuery()

    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-2 pt-10">
                <Loading />
            </div>
        )
    }

    return (
        <div className="flex flex-1 flex-col gap-2 pt-10">
            <h1 className="text-xl font-bold">Current Artist Codes</h1>
            <Separator />
            <div className="flex flex-col gap-5">
                <DataTable
                    columnDefs={[
                        {
                            field: 'code',
                            headerName: 'Code',
                            flex: 1,
                            onCellClicked: ({ data }) => {
                                if (!data) return

                                toast.info('Copied to Clipboard')

                                void navigator.clipboard.writeText(data.code)
                            }
                        },
                        {
                            field: 'createdAt',
                            headerName: 'Created At',
                            flex: 1,
                            filter: true
                        }
                    ]}
                    rowData={data}
                />
            </div>
        </div>
    )
}
