'use client'

import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from '~/components/ui/dropdown-menu'
import { Button } from '~/components/ui/button'
import { useState } from 'react'
import { Id } from 'react-toastify'
import { useTheme } from 'next-themes'
import { api } from '~/trpc/react'
import { nemu_toast } from '~/lib/utils'
import { CheckCircle2Icon, MenuIcon, XCircleIcon } from 'lucide-react'

export default function RequestCardDropdown(props: { request_id: string }) {
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

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant={'outline'}>
                    <MenuIcon className="h-6 w-6" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem
                    onMouseDown={() => {
                        mutation.mutate({
                            request_id: props.request_id,
                            accepted: true
                        })
                    }}
                >
                    <CheckCircle2Icon className="h-6 w-6" />
                    Accept
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="hover:!bg-error"
                    onMouseDown={() => {
                        mutation.mutate({
                            request_id: props.request_id,
                            accepted: false
                        })
                    }}
                >
                    <XCircleIcon className="h-6 w-6" />
                    Decline
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
