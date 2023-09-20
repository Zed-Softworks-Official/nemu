import React  from "react";

import { getSession } from '@auth0/nextjs-auth0'

import Artist from './Artist'
import SignedOut from "./SignedOut";

import prisma from "@/prisma/prisma";

export default async function UserInfo() {
    const session = await getSession();

    if (!session) {
        return (
            <SignedOut />
        )
    }

    let artist_info = await prisma.artist.findFirst({
        where: {
            auth0id: session.user!.sub!
        }
    });

    return (
        <Artist artist_handle={artist_info!.handle} />
    )
}
