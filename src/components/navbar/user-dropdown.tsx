import { LogInIcon, LogOutIcon, Settings2Icon, UserIcon } from 'lucide-react'
import { User } from 'next-auth'
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from '~/components/ui/dropdown-menu'

import { Button } from '~/components/ui/button'
import Link from 'next/link'

export default function UserDropdown({ user }: { user: User | undefined }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {user ? (
                    <Avatar className="cursor-pointer">
                        <AvatarImage src={user.image || '/profile.png'} alt="Avatar" />
                        <AvatarFallback>
                            <UserIcon className="w-6 h-6" />
                        </AvatarFallback>
                    </Avatar>
                ) : (
                    <UserIcon className="w-6 h-6" />
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                {user ? (
                    <UserDropdownContent user={user} />
                ) : (
                    <DropdownMenuItem>
                        <Link href="/u/login" className="flex gap-3 w-full">
                            <LogInIcon className="w-6 h-6" />
                            Log in
                        </Link>
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

function UserDropdownContent({ user }: { user: User }) {
    return (
        <>
            <DropdownMenuItem>
                <Link href={'/account'} className="flex gap-3 w-full">
                    <Settings2Icon className="w-6 h-6" />
                    Account
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
                <LogOutIcon className="w-6 h-6" />
                Sign Out
            </DropdownMenuItem>
        </>
    )
}
