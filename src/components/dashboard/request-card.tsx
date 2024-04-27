'use client'
import { useState } from 'react'
import { Id } from 'react-toastify'
import { useTheme } from 'next-themes'
import { CheckCircle2Icon, EyeIcon, MenuIcon, XCircleIcon } from 'lucide-react'

import { api } from '~/trpc/react'

import { nemu_toast } from '~/lib/utils'

import { Button } from '~/components/ui/button'
import NemuImage from '~/components/nemu-image'
import { ClientRequestData } from '~/core/structures'
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

    const request_data = JSON.parse(request.content)

    return (
        <Dialog>
            <div className="flex flex-col p-5 bg-base-200 rounded-xl transition-all duration-200 ease-in-out animate-pop-in">
                <div className="flex justify-center items-center flex-col gap-5">
                    <Avatar>
                        <AvatarImage src={request.user.image!} alt="User Profile Photo" />
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
                    <h3 className="card-title">{request.user.name}</h3>
                </div>
                <div className="divider-vertical"></div>
                <div className="flex flex-col gap-5">
                    <div className="flex flex-row gap-5">
                        {accepted_data ? (
                            <Link
                                href={`/dashboard/commissions/${accepted_data.slug}/${request.orderId}`}
                                className="btn btn-primary text-white w-full"
                            >
                                <EyeIcon className="w-6 h-6" />
                                View Request
                            </Link>
                        ) : (
                            <DialogTrigger asChild>
                                <Button className="w-full">
                                    <EyeIcon className="w-6 h-6" />
                                    View Request
                                </Button>
                            </DialogTrigger>
                        )}
                    </div>
                </div>
            </div>
            <DialogContent>
                <DialogHeader className="flex flex-row justify-between items-center">
                    <div>
                        <DialogTitle>Requst from {request.user.name}</DialogTitle>
                        <DialogDescription>
                            <span className="text-base-content/60 italic">
                                Requested:{' '}
                                <time>
                                    {new Date(request.createdAt).toLocaleDateString()}
                                </time>
                            </span>
                        </DialogDescription>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant={'outline'}>
                                <MenuIcon className="w-6 h-6" />
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
                                <CheckCircle2Icon className="w-6 h-6" />
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
                                <XCircleIcon className="w-6 h-6" />
                                Decline
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </DialogHeader>
                <div>
                    <div className="divider"></div>
                    <div className="flex flex-col gap-5">
                        {Object.keys(request_data).map((key, i) => (
                            <div key={i} className="flex flex-col gap-5">
                                <div className="bg-base-100 p-5 rounded-xl">
                                    <h3 className="card-title">
                                        {request_data[key].label}
                                    </h3>
                                    <p>{request_data[key].value}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

{
    /* <Button
                            onClick={() => {
                                mutation.mutate({
                                    request_id: request.id,
                                    accepted: true
                                })
                            }}
                        >
                            <CheckCircle2Icon className="w-6 h-6" />
                            Accept
                        </Button>
                        <Button
                            variant={'outline'}
                            onClick={() => {
                                mutation.mutate({
                                    request_id: request.id,
                                    accepted: false
                                })
                            }}
                        >
                            <XCircleIcon className="w-6 h-6" />
                            Decline
                        </Button> */
}
