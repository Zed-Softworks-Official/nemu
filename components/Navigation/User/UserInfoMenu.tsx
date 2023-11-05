'use client'

import Link from 'next/link'
import React, { Fragment } from 'react'
import { useSession } from 'next-auth/react'

import { Menu, Transition } from '@headlessui/react'
import {
    ArrowRightOnRectangleIcon,
    ChartBarIcon,
    Cog6ToothIcon,
    EnvelopeIcon,
    PaintBrushIcon,
    StarIcon,
    UserIcon,
    ArrowLeftOnRectangleIcon,
    UsersIcon,
    CheckCircleIcon
} from '@heroicons/react/20/solid'

import { Role } from '@/helpers/user-info'
import classNames from '@/helpers/classnames'
import {
    UserInfoIcon,
    UserInfoLink,
    UserInfoObject
} from '@/helpers/userinfo-links'

export default function UserInfoMenu() {
    const { data: session } = useSession()

    /////////////////////////////////
    // Get the correct Navbar items
    /////////////////////////////////
    function GetCurrentNavbarItems(
        session: boolean,
        role: Role,
        handle?: string
    ) {
        // Check if we have a session
        if (session) {
            // If we're not an artist then we're a standard user
            switch (role) {
                case Role.Artist:
                    let infoObject = UserInfoObject.Artist
                    infoObject[0].path = `/@${handle}`

                    return infoObject
                case Role.Admin:
                    return UserInfoObject.Admin
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
                return <PaintBrushIcon className="user-menu-item-icon" />
            case UserInfoIcon.Dashboard:
                return <ChartBarIcon className="user-menu-item-icon" />
            case UserInfoIcon.Favourite:
                return <StarIcon className="user-menu-item-icon" />
            case UserInfoIcon.Messages:
                return <EnvelopeIcon className="user-menu-item-icon" />
            case UserInfoIcon.Settings:
                return <Cog6ToothIcon className="user-menu-item-icon" />
            case UserInfoIcon.SignIn:
                return <ArrowLeftOnRectangleIcon className="user-menu-item-icon" />
            case UserInfoIcon.SignOut:
                return <ArrowRightOnRectangleIcon className="user-menu-item-icon" />
            case UserInfoIcon.Verify:
                return <CheckCircleIcon className="user-menu-item-icon" />
        }
    }

    // initialize the navbar items
    let navbar_items: UserInfoLink[] = GetCurrentNavbarItems(
        session ? true : false,
        session?.user.role!,
        session?.user.handle
    )

    return (
        <Menu as="div" className="relative inline-block text-left mt-3 ml-20">
            <div>
                <Menu.Button className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white dark:bg-charcoal font-semibold">
                    {session?.user?.image ? (
                        <img
                            src={session?.user?.image!}
                            className="rounded-full"
                        />
                    ) : (
                        <UserIcon className="h-6 w-6 text-black" />
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
                <Menu.Items className="absolute right-0 z-10 mt-5 w-56 scale-0 origin-top rounded-md bg-fullwhite dark:bg-fullblack shadow-lg focus:outline-none">
                    <div className="py-2">
                        {navbar_items.map((item: UserInfoLink) => {
                            return (
                                <Menu.Item key={item.title}>
                                    {({ active }) => (
                                        <Link
                                            href={item.path}
                                            className={classNames(
                                                active
                                                    ? 'bg-white text-charcoal dark:bg-charcoal dark:text-white'
                                                    : 'text-charcoal dark:text-white',
                                                'block px-5 py-2 text-sm'
                                            )}
                                        >
                                            {ConvertUserIconEnumToReactDOM(
                                                item.icon
                                            )}
                                            {item.title}
                                        </Link>
                                    )}
                                </Menu.Item>
                            )
                        })}
                    </div>
                </Menu.Items>
            </Transition>
        </Menu>
    )
}
