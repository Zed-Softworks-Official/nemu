"use client"

import React, { Fragment } from "react";

import { Menu, Transition } from "@headlessui/react";
import { ArrowRightOnRectangleIcon, ChartBarIcon, Cog6ToothIcon, EnvelopeIcon, PaintBrushIcon, UserIcon } from "@heroicons/react/20/solid";

import classNames from "./classnames";

export default function Artist() {
    return (
        <Menu as="div" className="relative inline-block text-left mt-5 ml-20">
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
                <Menu.Items className="absolute right-0 z-10 mt-10 w-56 scale-0 origin-top rounded-md bg-fullwhite shadow-lg focus:outline-none">
                    <div className="py-2">
                        <Menu.Item>
                            {({ active }) => (
                                <a href="/"
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}>
                                    <PaintBrushIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    My Page                                            
                                </a>
                            )}
                        </Menu.Item>
                        <Menu.Item>
                            {({ active }) => (
                                <a href="/"
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}>
                                    <ChartBarIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    Artist Dashboard                                           
                                </a>
                            )}
                        </Menu.Item>
                        <Menu.Item>
                            {({ active }) => (
                                <a href="/"
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}>
                                    <EnvelopeIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    Messages                                           
                                </a>
                            )}
                        </Menu.Item>
                        <Menu.Item>
                            {({ active }) => (
                                <a href="/"
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}>
                                    <Cog6ToothIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    Account Settings                                           
                                </a>
                            )}
                        </Menu.Item>
                        <Menu.Item>
                            {({ active }) => (
                                <a href="/api/auth/logout"
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}>
                                    <ArrowRightOnRectangleIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    Sign Out                                           
                                </a>
                            )}
                        </Menu.Item>
                    </div>
                </Menu.Items>
            </Transition>
        </Menu>
    )
}