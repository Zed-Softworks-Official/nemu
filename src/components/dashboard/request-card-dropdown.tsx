'use client'

import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from '~/components/ui/dropdown-menu'
import { Button } from '~/components/ui/button'
import { useState } from 'react'
import { api } from '~/trpc/react'
import { CheckCircle2Icon, MenuIcon, XCircleIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function RequestCardDropdown(props: { request_id: string }) {
    const [toastId, setToastId] = useState<string | number | null>(null)
    const router = useRouter()

    const mutation = api.requests.determine_request.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Updating Request'))
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Request Updated', {
                id: toastId
            })
            router.refresh()
        },
        onError: (e) => {
            if (!toastId) return

            toast.error(e.message, {
                id: toastId
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
