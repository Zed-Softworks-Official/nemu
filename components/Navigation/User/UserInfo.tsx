"use client"

import React  from "react";

import { useUser } from '@auth0/nextjs-auth0/client'

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
