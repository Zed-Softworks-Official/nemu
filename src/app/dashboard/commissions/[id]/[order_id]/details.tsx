'use client'

import { MoreVertical } from 'lucide-react'
import { notFound } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { DataTable } from '~/app/_components/data-table'
import { useDashboardOrder } from '~/app/_components/orders/dashboard-order'

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
} from '~/app/_components/ui/alert-dialog'
import { Button } from '~/app/_components/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/app/_components/ui/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/app/_components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/app/_components/ui/tabs'

import { api } from '~/trpc/react'
import { Kanban } from './kanban'

import { UploadDropzone } from '~/app/_components/uploadthing'
import { InvoiceEditor } from './invoice-editor'
import { MessagesClient } from '~/app/_components/messages/messages-client'
import { Label } from '~/app/_components/ui/label'
import { Checkbox } from '~/app/_components/ui/checkbox'

export function CommissionHeader() {
    const { requestData } = useDashboardOrder()

    return (
        <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">
                {requestData?.user.username} | {requestData?.commission?.title}
            </h1>
            <span className="text-muted-foreground text-sm">
                {requestData?.createdAt?.toLocaleDateString()}
            </span>
        </div>
    )
}

export function CommissionDetails() {
    const [acceptDialogStatus, setAcceptDialogStatus] = useState(true)
    const { requestData } = useDashboardOrder()
    const utils = api.useUtils()

    const determineRequest = api.request.determineRequest.useMutation({
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

            void utils.request.getRequestById.invalidate()
        }
    })

    if (!requestData?.content) {
        return notFound()
    }

    return (
        <AlertDialog>
            <Card>
                <CardHeader className="flex w-full flex-row items-center justify-between">
                    <CardTitle>Request Details</CardTitle>
                    {requestData?.status === 'pending' && (
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
                        rowData={Object.entries(requestData?.content).map(
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
                                requestId: requestData.id,
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
    const { requestData } = useDashboardOrder()

    if (requestData?.status === 'pending') {
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
                <MessagesClient currentOrderId={requestData?.orderId} listHidden />
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
    const { requestData } = useDashboardOrder()
    const utils = api.useUtils()

    const requestFailed = api.request.requestFailed.useMutation()
    const createDelivery = api.request.updateRequestDelivery.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Uploading Delivery')

            return { toast_id }
        },
        onError: (err, data, context) => {
            requestFailed.mutate({
                fileKey: data.fileKey
            })

            toast.error(err.message, {
                id: context?.toast_id
            })
        },
        onSuccess: (_, __, context) => {
            toast.success('Delivery Uploaded', {
                id: context?.toast_id
            })

            void utils.request.getRequestById.invalidate()
        }
    })

    if (!requestData?.id) return null

    if (requestData.delivery?.isFinal) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Delivery</CardTitle>
                    {requestData?.delivery && (
                        <CardDescription className="flex flex-col gap-2">
                            <p>
                                Delivery Date:{' '}
                                {requestData.delivery?.updatedAt.toLocaleDateString()}
                            </p>
                            <p>Version: {requestData.delivery?.version}</p>
                        </CardDescription>
                    )}
                </CardHeader>
            </Card>
        )
    }

    if (requestData.invoices?.[0]?.status !== 'paid') {
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
                {requestData?.delivery && (
                    <CardDescription className="flex flex-col gap-2">
                        <p>
                            Delivery Date:{' '}
                            {requestData.delivery?.updatedAt.toLocaleDateString()}
                        </p>
                        <p>Version: {requestData.delivery?.version}</p>
                    </CardDescription>
                )}
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-2">
                    <Checkbox
                        value={isFinal ? 'checked' : undefined}
                        onCheckedChange={(checked) => setIsFinal(checked ? true : false)}
                        disabled={
                            requestData.invoices?.length !==
                            requestData.currentInvoiceIndex
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
                            orderId: requestData.orderId,
                            fileKey: res[0].key,
                            fileType: res[0].type,
                            isFinal: isFinal
                        })
                    }}
                />
            </CardContent>
        </Card>
    )
}
