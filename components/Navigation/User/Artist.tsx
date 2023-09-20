"use client"

import React, { Fragment } from "react";

import { Menu, Transition } from "@headlessui/react";
import { ArrowRightOnRectangleIcon, ChartBarIcon, Cog6ToothIcon, EnvelopeIcon, PaintBrushIcon, StarIcon, UserIcon } from "@heroicons/react/20/solid";

import Link from "next/link";

import classNames from "./classnames";

export default function Artist({ artist_handle }: { artist_handle: string}) {

    let artist_link = '/@' + artist_handle;

    return (
        <Menu as="div" className="relative inline-block text-left mt-3 ml-20">
            <div>
                <Menu.Button className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white font-semibold">
                    <UserIcon className="h-6 w-6 text-black"/>
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
                <Menu.Items className="absolute right-0 z-10 mt-5 w-56 scale-0 origin-top rounded-md bg-fullwhite shadow-lg focus:outline-none">
                    <div className="py-2">
                        <Menu.Item>
                            {({ active }) => (
                                <Link href={artist_link} 
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}>
                                    <PaintBrushIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    My Page  
                                </Link>
                            )}
                        </Menu.Item>
                        <Menu.Item>
                            {({ active }) => (
                                <Link href={"/dashboard"}
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}>
                                    <ChartBarIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    Artist Dashboard  
                                </Link>
                            )}
                        </Menu.Item>
                        <Menu.Item>
                            {({ active }) => (
                                <Link href={"/favourites"}
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}
                                >
                                    <StarIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    Favourites
                                </Link>
                            )}
                        </Menu.Item>
                        <Menu.Item>
                            {({ active }) => (
                                <Link href={"/"}
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}
                                >
                                    <EnvelopeIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    Messages 
                                </Link>
                            )}
                        </Menu.Item>
                        <Menu.Item>
                            {({ active }) => (
                                <Link href={"/dashboard/settings"}
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}>
                                    <Cog6ToothIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    Account Settings  
                                </Link>
                            )}
                        </Menu.Item>
                        <Menu.Item>
                            {({ active }) => (
                                <Link href={"/api/auth/logout"}
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}>
                                    <ArrowRightOnRectangleIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    Sign Out  
                                </Link>
                            )}
                        </Menu.Item>
                    </div>
                </Menu.Items>
            </Transition>
        </Menu>
    )
}