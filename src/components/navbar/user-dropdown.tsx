import { BrushIcon, LogInIcon, LogOutIcon, Settings2Icon, UserIcon } from 'lucide-react'
import { User } from 'next-auth'
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from '~/components/ui/dropdown-menu'

import Link from 'next/link'
import { api } from '~/trpc/server'

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
            <DropdownMenuContent className="min-w-52">
                {user ? (
                    <UserDropdownContent user={user} />
                ) : (
                    <DropdownMenuItem>
                        <Link href="/u/login" className="user-dropdown-item">
                            <LogInIcon className="w-6 h-6" />
                            Log in
                        </Link>
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

async function UserDropdownContent({ user }: { user: User }) {
    const data = await api.user.get_user()

    return (
        <>
            {data?.artist && (
                <DropdownMenuItem>
                    <Link href={`/@${data.artist.handle}`} className="user-dropdown-item">
                        <BrushIcon className="w-6 h-6" />
                        My Page
                    </Link>
                </DropdownMenuItem>
            )}
            <DropdownMenuItem>
                <Link href={'/account'} className="user-dropdown-item">
                    <Settings2Icon className="w-6 h-6" />
                    Account
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
                <Link href={'/api/auth/signout'} className="user-dropdown-item">
                    <LogOutIcon className="w-6 h-6" />
                    Sign Out
                </Link>
            </DropdownMenuItem>
        </>
    )
}
