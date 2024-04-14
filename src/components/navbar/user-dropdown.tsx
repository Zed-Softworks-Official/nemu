import { LogInIcon, UserIcon } from 'lucide-react'
import { User } from 'next-auth'
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from '~/components/ui/dropdown-menu'

export default function UserDropdown({ user }: { user: User | undefined }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger>
                {user ? (
                    <Avatar>
                        <AvatarImage src={user.image || '/profile.png'} alt="Avatar" />
                        <AvatarFallback></AvatarFallback>
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
                        <LogInIcon className="w-6 h-6" />
                        Log in
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

function UserDropdownContent({ user }: { user: User }) {
    return <></>
}
