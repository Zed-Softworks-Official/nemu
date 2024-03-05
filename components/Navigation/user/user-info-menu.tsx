'use client'

import Link from 'next/link'
import React, { Fragment } from 'react'
import { useSession } from 'next-auth/react'

import { Menu, Transition } from '@headlessui/react'
import {
    ChartBarIcon,
    Cog6ToothIcon,
    EnvelopeIcon,
    PaintBrushIcon,
    StarIcon,
    UserIcon,
    CheckCircleIcon,
    CodeBracketIcon,
    ArrowRightStartOnRectangleIcon,
    ArrowRightEndOnRectangleIcon
} from '@heroicons/react/20/solid'

import { ClassNames } from '@/core/helpers'
import { UserInfoIcon, UserInfoLink, UserInfoObject, Role } from '@/core/structures'
import Image from 'next/image'
import ThemeSwitcher from '@/components/theme/theme-switcher'
import NemuImage from '@/components/nemu-image'

export default function UserInfoMenu() {
    const { data: session } = useSession()

    /////////////////////////////////
    // Get the correct Navbar items
    /////////////////////////////////
    function GetCurrentNavbarItems(session: boolean, role: Role, handle?: string) {
        // Check if we have a session
        if (session) {
            // If we're not an artist then we're a standard user
            switch (role) {
                case Role.Artist:
                    let infoObject = UserInfoObject.Artist
                    infoObject[0].path = `/@${handle}`

                    return infoObject.concat(UserInfoObject.Standard)
                case Role.Admin:
                    return UserInfoObject.Admin.concat(UserInfoObject.Standard)
            }

            return UserInfoObject.Standard
        }

        return UserInfoObject.SignedOut
    }

    /////////////////////////////////
    // Convert Enum to Component
    /////////////////////////////////
    function ConvertUserIconEnumToReactDOM(icon: UserInfoIcon) {
        switch (icon) {
            case UserInfoIcon.Page:
                return <PaintBrushIcon className="w-6 h-6" />
            case UserInfoIcon.Dashboard:
                return <ChartBarIcon className="w-6 h-6" />
            case UserInfoIcon.Favourite:
                return <StarIcon className="w-6 h-6" />
            case UserInfoIcon.Messages:
                return <EnvelopeIcon className="w-6 h-6" />
            case UserInfoIcon.Settings:
                return <Cog6ToothIcon className="w-6 h-6" />
            case UserInfoIcon.SignIn:
                return <ArrowRightEndOnRectangleIcon className="w-6 h-6" />
            case UserInfoIcon.SignOut:
                return <ArrowRightStartOnRectangleIcon className="w-6 h-6" />
            case UserInfoIcon.Verify:
                return <CheckCircleIcon className="w-6 h-6" />
            case UserInfoIcon.Code:
                return <CodeBracketIcon className="w-6 h-6" />
        }
    }

    // initialize the navbar items
    let navbar_items: UserInfoLink[] = GetCurrentNavbarItems(session ? true : false, session?.user.role!, session?.user.handle)

    return (
        <Menu as="div" className="relative inline-block text-left mt-3 ml-20">
            <div>
                <Menu.Button className="inline-flex w-full justify-center gap-x-1.5 rounded-md font-semibold btn btn-ghost btn-circle hover:bg-transparent">
                    {session?.user ? (
                        session?.user?.image ? (
                            <NemuImage src={session?.user?.image!} alt="profile image" width={50} height={50} className="rounded-full w-16" />
                        ) : (
                            <NemuImage src={'/profile.png'} alt="profile image" width={50} height={50} className="avatar rounded-full w-16" />
                        )
                    ) : (
                        <div className="avatar rounded-full skeleton w-12 h-12"></div>
                    )}
                </Menu.Button>
            </div>
            <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-95"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
            >
                <Menu.Items className="absolute right-0 z-10 mt-5 w-56 scale-0 origin-top rounded-md bg-base-300 shadow-lg focus:outline-none">
                    <div className="py-2">
                        {navbar_items.map((item: UserInfoLink) => {
                            return (
                                <Menu.Item key={item.title}>
                                    {({ active }) => (
                                        <Link
                                            href={item.path}
                                            className={ClassNames(
                                                active ? 'bg-base-100 text-base-content' : 'bg-base-300 text-base-content',
                                                'flex justify-start items-center gap-5 w-full px-5 py-2 text-sm'
                                            )}
                                        >
                                            {ConvertUserIconEnumToReactDOM(item.icon)}
                                            {item.title}
                                        </Link>
                                    )}
                                </Menu.Item>
                            )
                        })}
                        <Menu.Item>{({ active }) => <ThemeSwitcher active={active} />}</Menu.Item>
                    </div>
                </Menu.Items>
            </Transition>
        </Menu>
    )
}
