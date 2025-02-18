'use client'

import { MoreVertical } from 'lucide-react'
import { notFound } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { DataTable } from '~/components/data-table'
import { useDashboardOrder } from '~/components/orders/dashboard-order'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogFooter,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    AlertDialogDescription
} from '~/components/ui/alert-dialog'
import { Button } from '~/components/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'

import { api } from '~/trpc/react'
import { Kanban } from './kanban'

import { UploadDropzone } from '~/components/files/uploadthing'
import { InvoiceEditor } from './invoice-editor'
import { MessagesClient } from '~/components/messages/messages-client'
import { Label } from '~/components/ui/label'
import { Checkbox } from '~/components/ui/checkbox'

export function CommissionHeader() {
    const { request_data } = useDashboardOrder()

    return (
        <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">
                {request_data?.user.username} | {request_data?.commission?.title}
            </h1>
            <span className="text-muted-foreground text-sm">
                {request_data?.created_at?.toLocaleDateString()}
            </span>
        </div>
    )
}

export function CommissionDetails() {
    const [acceptDialogStatus, setAcceptDialogStatus] = useState(true)
    const { request_data } = useDashboardOrder()
    const utils = api.useUtils()

    const determineRequest = api.request.determine_request.useMutation({
        onMutate: (input) => {
            const toast_id = toast.loading(
                `${input.accepted ? 'Accepting' : 'Rejecting'} request...`
            )

            return { toast_id }
        },
        onError: (error, input, context) => {
            toast.error(error.message, {
                id: context?.toast_id
            })
        },
        onSuccess: (_, input, context) => {
            toast.success(`${input.accepted ? 'Accepted' : 'Rejected'} request`, {
                id: context?.toast_id
            })

            void utils.request.get_request_by_id.invalidate()
        }
    })

    if (!request_data?.content) {
        return notFound()
    }

    return (
        <AlertDialog>
            <Card>
                <CardHeader className="flex w-full flex-row items-center justify-between">
                    <CardTitle>Request Details</CardTitle>
                    {request_data?.status === 'pending' && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    asChild
                                    disabled={determineRequest.isPending}
                                >
                                    <Button variant={'ghost'}>
                                        <MoreVertical className="h-6 w-6" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem>
                                        <AlertDialogTrigger
                                            className="w-full text-start"
                                            onClick={() => setAcceptDialogStatus(true)}
                                        >
                                            Accept
                                        </AlertDialogTrigger>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                        <AlertDialogTrigger
                                            className="w-full text-start"
                                            onClick={() => setAcceptDialogStatus(false)}
                                        >
                                            Reject
                                        </AlertDialogTrigger>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    <DataTable
                        columnDefs={[
                            {
                                headerName: 'Form Element',
                                field: 'key',
                                cellRenderer: ({
                                    data
                                }: {
                                    data: { key: string; value: string }
                                }) => {
                                    return <span className="font-bold">{data.key}</span>
                                }
                            },
                            {
                                headerName: 'Response',
                                field: 'value',
                                flex: 1,
                                wrapText: true
                            }
                        ]}
                        rowData={Object.entries(request_data?.content).map(
                            ([key, value]) => ({
                                key,
                                value
                            })
                        )}
                    />
                </CardContent>
            </Card>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {acceptDialogStatus ? 'Accept' : 'Reject'} the request?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This action will {acceptDialogStatus ? 'accept' : 'reject'} the
                        request. And cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            determineRequest.mutate({
                                request_id: request_data.id,
                                accepted: acceptDialogStatus
                            })
                        }}
                    >
                        {acceptDialogStatus ? 'Accept' : 'Reject'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

export function CommissionDetailsTabs() {
    const { request_data } = useDashboardOrder()

    if (request_data?.status === 'pending') {
        return null
    }

    return (
        <Tabs defaultValue="kanban">
            <TabsList>
                <TabsTrigger value="kanban">Kanban</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="invoice">Invoice</TabsTrigger>
                <TabsTrigger value="delivery">Delivery</TabsTrigger>
            </TabsList>
            <TabsContent value="kanban">
                <Kanban />
            </TabsContent>
            <TabsContent value="messages">
                <MessagesClient current_order_id={request_data?.order_id} list_hidden />
            </TabsContent>
            <TabsContent value="invoice">
                <InvoiceEditor />
            </TabsContent>
            <TabsContent value="delivery">
                <Delivery />
            </TabsContent>
        </Tabs>
    )
}

function Delivery() {
    const [isFinal, setIsFinal] = useState(false)
    const { request_data } = useDashboardOrder()
    const utils = api.useUtils()

    const requestFailed = api.request.request_failed.useMutation()
    const createDelivery = api.request.update_request_delivery.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Uploading Delivery')

            return { toast_id }
        },
        onError: (err, data, context) => {
            requestFailed.mutate({
                file_key: data.file_key
            })

            toast.error(err.message, {
                id: context?.toast_id
            })
        },
        onSuccess: (_, __, context) => {
            toast.success('Delivery Uploaded', {
                id: context?.toast_id
            })

            void utils.request.get_request_by_id.invalidate()
        }
    })

    if (!request_data?.id) return null

    if (request_data.delivery?.is_final) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Delivery</CardTitle>
                    {request_data?.delivery && (
                        <CardDescription className="flex flex-col gap-2">
                            <p>
                                Delivery Date:{' '}
                                {request_data.delivery?.updated_at.toLocaleDateString()}
                            </p>
                            <p>Version: {request_data.delivery?.version}</p>
                        </CardDescription>
                    )}
                </CardHeader>
            </Card>
        )
    }

    if (request_data.invoices?.[0]?.status !== 'paid') {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Delivery</CardTitle>
                    <CardDescription>
                        Delivery will be made available after user pays for an invoice
                    </CardDescription>
                </CardHeader>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Delivery</CardTitle>
                {request_data?.delivery && (
                    <CardDescription className="flex flex-col gap-2">
                        <p>
                            Delivery Date:{' '}
                            {request_data.delivery?.updated_at.toLocaleDateString()}
                        </p>
                        <p>Version: {request_data.delivery?.version}</p>
                    </CardDescription>
                )}
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-2">
                    <Checkbox
                        value={isFinal ? 'checked' : undefined}
                        onCheckedChange={(checked) => setIsFinal(checked ? true : false)}
                        disabled={
                            request_data.invoices?.length !==
                            request_data.current_invoice_index
                        }
                        name="isFinal"
                        id="isFinal"
                    />
                    <Label htmlFor="isFinal">Mark as Final</Label>
                </div>
                <UploadDropzone
                    endpoint="commissionDownloadUploader"
                    onClientUploadComplete={(res) => {
                        if (!res[0]) {
                            toast.error('No file uploaded')

                            return
                        }

                        createDelivery.mutate({
                            order_id: request_data.order_id,
                            file_key: res[0].key,
                            file_type: res[0].type,
                            is_final: isFinal
                        })
                    }}
                />
            </CardContent>
        </Card>
    )
}
