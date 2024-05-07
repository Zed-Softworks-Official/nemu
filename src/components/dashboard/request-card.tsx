'use client'

import { useState } from 'react'
import { Id } from 'react-toastify'
import { useTheme } from 'next-themes'
import { CheckCircle2Icon, EyeIcon, MenuIcon, XCircleIcon } from 'lucide-react'

import { api } from '~/trpc/react'

import { nemu_toast } from '~/lib/utils'

import { Button } from '~/components/ui/button'
import NemuImage from '~/components/nemu-image'
import { ClientRequestData, RequestContent } from '~/core/structures'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '~/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import Link from 'next/link'
import { FormElementInstance } from '~/components/form-builder/elements/form-elements'

export default function RequestCard({
    request,
    accepted_data
}: {
    request: ClientRequestData
    accepted_data?: { accepted: boolean; slug: string }
}) {
    const [toastId, setToastId] = useState<Id | null>(null)

    const { resolvedTheme } = useTheme()

    const mutation = api.requests.determine_request.useMutation({
        onMutate: (data) => {
            setToastId(nemu_toast.loading('Updating Request', { theme: resolvedTheme }))
        },
        onSuccess: (res) => {
            if (!toastId) return

            nemu_toast.update(toastId, {
                render: 'Request Updated',
                type: 'success',
                isLoading: false,
                autoClose: 5000
            })
        },
        onError: (e) => {
            if (!toastId) return

            nemu_toast.update(toastId, {
                render: e.message,
                type: 'error',
                isLoading: false,
                autoClose: 5000
            })
        }
    })

    const request_data = request.content as RequestContent

    return (
        <Dialog>
            <div className="flex animate-pop-in flex-col rounded-xl bg-base-200 p-5 transition-all duration-200 ease-in-out">
                <div className="flex flex-col items-center justify-center gap-5">
                    <Avatar>
                        <AvatarImage
                            src={request.user.imageUrl}
                            alt="User Profile Photo"
                        />
                        <AvatarFallback>
                            <NemuImage
                                src={'/profile.png'}
                                alt="User Profile Photo"
                                width={20}
                                height={20}
                                priority
                            />
                        </AvatarFallback>
                    </Avatar>
                    <h3 className="card-title">{request.user.username}</h3>
                </div>
                <div className="divider-vertical"></div>
                <div className="flex flex-col gap-5">
                    <div className="flex flex-row gap-5">
                        {accepted_data ? (
                            <Link
                                href={`/dashboard/commissions/${accepted_data.slug}/${request.order_id}`}
                                className="btn btn-primary w-full text-white"
                            >
                                <EyeIcon className="h-6 w-6" />
                                View Request
                            </Link>
                        ) : (
                            <DialogTrigger asChild>
                                <Button className="w-full">
                                    <EyeIcon className="h-6 w-6" />
                                    View Request
                                </Button>
                            </DialogTrigger>
                        )}
                    </div>
                </div>
            </div>
            <DialogContent>
                <DialogHeader className="flex flex-row items-center justify-between">
                    <div>
                        <DialogTitle>Requst from {request.user.username}</DialogTitle>
                        <DialogDescription>
                            <span className="italic text-base-content/60">
                                Requested:{' '}
                                <time>
                                    {new Date(request.created_at).toLocaleDateString()}
                                </time>
                            </span>
                        </DialogDescription>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant={'outline'}>
                                <MenuIcon className="h-6 w-6" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem
                                onClick={() => {
                                    mutation.mutate({
                                        request_id: request.id,
                                        accepted: true
                                    })
                                }}
                            >
                                <CheckCircle2Icon className="h-6 w-6" />
                                Accept
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="hover:!bg-error"
                                onClick={() => {
                                    mutation.mutate({
                                        request_id: request.id,
                                        accepted: false
                                    })
                                }}
                            >
                                <XCircleIcon className="h-6 w-6" />
                                Decline
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </DialogHeader>
                <div>
                    <div className="divider"></div>
                    <div className="flex flex-col gap-5">
                        {Object.keys(request_data).map((key) => (
                            <div key={key} className="flex flex-col gap-5">
                                <div className="rounded-xl bg-base-100 p-5">
                                    <h3 className="card-title">
                                        {request_data[key]?.label}
                                    </h3>
                                    <p>{request_data[key]?.value}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
