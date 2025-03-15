'use client'

import { CheckCircle, Menu, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '~/app/_components/data-table'
import NemuImage from '~/app/_components/nemu-image'
import { Button } from '~/app/_components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/app/_components/ui/dropdown-menu'
import Loading from '~/app/_components/ui/loading'
import { api, type RouterOutputs } from '~/trpc/react'

export default function VertificationDataTable() {
    const { data, isLoading } = api.artistVerification.getArtistVerifications.useQuery()

    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loading />
            </div>
        )
    }

    if (!data) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <NemuImage src="/nemu/sad.png" alt="Nemu Logo" />
                <p className="text-2xl font-bold">No data found</p>
            </div>
        )
    }

    return (
        <DataTable
            columnDefs={[
                {
                    field: 'requestedHandle',
                    headerName: 'Handle'
                },
                {
                    field: 'twitter',
                    headerName: 'Twitter'
                },
                {
                    field: 'website',
                    headerName: 'Website'
                },
                {
                    field: 'createdAt',
                    headerName: 'Created At'
                },
                {
                    field: 'id',
                    headerName: 'Actions',
                    cellRenderer: VerifyButton
                }
            ]}
            rowData={data}
        />
    )
}

function VerifyButton(props: {
    data: NonNullable<
        RouterOutputs['artistVerification']['getArtistVerifications']
    >[number]
}) {
    const utils = api.useUtils()
    const acceptArtist = api.artistVerification.acceptArtist.useMutation({
        onMutate: () => {
            const toastId = toast.loading('Verifying artist')

            return { toastId }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Artist Verified', {
                id: ctx.toastId
            })

            void utils.artistVerification.getArtistVerifications.invalidate()
        },
        onError: (_, __, ctx) => {
            toast.error('Failed to verify artist', {
                id: ctx?.toastId
            })
        }
    })

    const rejectArtist = api.artistVerification.rejectArtist.useMutation({
        onMutate: () => {
            const toastId = toast.loading('Rejecting artist')

            return { toastId }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Artist Rejected', {
                id: ctx.toastId
            })

            void utils.artistVerification.getArtistVerifications.invalidate()
        },
        onError: (_, __, ctx) => {
            toast.error('Failed to reject artist', {
                id: ctx?.toastId
            })
        }
    })

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant={'ghost'} size={'icon'}>
                    <Menu className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem
                    onClick={() =>
                        acceptArtist.mutate({
                            id: props.data.id
                        })
                    }
                    disabled={
                        acceptArtist.isPending ||
                        acceptArtist.isSuccess ||
                        rejectArtist.isPending ||
                        rejectArtist.isSuccess
                    }
                >
                    <CheckCircle className="size-4" />
                    Verify
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() =>
                        rejectArtist.mutate({
                            id: props.data.id
                        })
                    }
                    disabled={
                        rejectArtist.isPending ||
                        rejectArtist.isSuccess ||
                        acceptArtist.isPending ||
                        acceptArtist.isSuccess
                    }
                >
                    <XCircle className="size-4" />
                    Reject
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
