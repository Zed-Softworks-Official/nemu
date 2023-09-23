"use client"

import React, { Fragment }  from "react";

import { Menu, Transition } from "@headlessui/react";
import { ArrowLeftOnRectangleIcon, UserIcon } from "@heroicons/react/20/solid";

import classNames from "@/helpers/classnames";

export default function SignedOut() {
    return (
        <Menu as="div" className="relative inline-block text-left mt-3 ml-20">
            <div>
                <Menu.Button className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white dark:bg-charcoal font-semibold">
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
                <Menu.Items className="absolute right-0 z-10 mt-5 w-56 scale-0 origin-top rounded-md bg-fullwhite dark:bg-charcoal shadow-lg focus:outline-none">
                    <div className="py-2">
                        <Menu.Item>
                            {({ active }) => (
                                <a href="/api/auth/login"
                                className={classNames(active ? 'bg-white text-charcoal' : 'text-charcoal', 'block px-5 py-2 text.sm')}>
                                    <ArrowLeftOnRectangleIcon className="h-6 w-6 text-charcoal inline mr-5" />
                                    Sign In                                           
                                </a>
                            )}
                        </Menu.Item>
                    </div>
                </Menu.Items>
            </Transition>
        </Menu>
    )
}