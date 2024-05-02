import {
    BarChartIcon,
    BrushIcon,
    CodeIcon,
    LogInIcon,
    LogOutIcon,
    Settings2Icon,
    UserIcon
} from 'lucide-react'

import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from '~/components/ui/dropdown-menu'

import Link from 'next/link'
import { SignedIn, SignedOut, SignOutButton } from '@clerk/nextjs'
import { User } from '@clerk/nextjs/server'
import { UserRole } from '~/core/structures'

export default async function UserDropdown({ user }: { user: User | null }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <div className="cursor-pointer">
                    <SignedIn>
                        <Avatar>
                            <AvatarImage src={user?.imageUrl} alt="Avatar" />
                            <AvatarFallback>
                                <UserIcon className="h-6 w-6" />
                            </AvatarFallback>
                        </Avatar>
                    </SignedIn>
                    <SignedOut>
                        <UserIcon className="h-6 w-6" />
                    </SignedOut>
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-52">
                <SignedIn>
                    <UserDropdownContent user={user!} />
                </SignedIn>
                <SignedOut>
                    <DropdownMenuItem>
                        <Link href="/u/login" className="flex w-full items-center gap-3">
                            <LogInIcon className="h-6 w-6" />
                            Log in
                        </Link>
                    </DropdownMenuItem>
                </SignedOut>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

async function UserDropdownContent({ user }: { user: User }) {
    return (
        <>
            {user.publicMetadata.role === UserRole.Artist && (
                <>
                    <DropdownMenuItem>
                        <Link
                            href={`/@${user.privateMetadata.artist_id}`}
                            className="flex w-full items-center gap-3"
                        >
                            <BrushIcon className="h-6 w-6" />
                            My Page
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                        <Link
                            href={`/dashboard`}
                            className="flex w-full items-center gap-3"
                        >
                            <BarChartIcon className="h-6 w-6" />
                            Artist's Dashboard
                        </Link>
                    </DropdownMenuItem>
                </>
            )}
            {user.publicMetadata.role === UserRole.Admin && (
                <>
                    <DropdownMenuItem>
                        <Link
                            href={'/artists/gen-code'}
                            className="flex w-full items-center gap-3"
                        >
                            <CodeIcon className="h-6 w-6" />
                            Generate Artist Code
                        </Link>
                    </DropdownMenuItem>
                </>
            )}
            <DropdownMenuItem>
                <Link href={'/u/account'} className="flex w-full items-center gap-3">
                    <Settings2Icon className="h-6 w-6" />
                    Account
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
                <SignOutButton>
                    <div className='flex w-full items-center gap-3'>
                        <LogOutIcon className="h-6 w-6" />
                        Sign out
                    </div>
                </SignOutButton>
            </DropdownMenuItem>
        </>
    )
}
