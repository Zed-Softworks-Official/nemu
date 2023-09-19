"use client"

import React, { Fragment }  from "react";

import { Menu, Transition } from "@headlessui/react";
import { ArrowLeftOnRectangleIcon, UserIcon } from "@heroicons/react/20/solid";

import { useUser } from '@auth0/nextjs-auth0/client'
import classNames from "./classnames";

import Artist from './Artist'
import Standard from "./Standard";

export default function UserInfo() {
    const { user, error } = useUser();

    if (!user) {
        return (
            <Standard />
        )
    }

    return (
        <Artist />
    )
}
