import React  from "react";

import { getSession } from '@auth0/nextjs-auth0'

import Artist from './Artist'
import Standard from "./Standard";

import prisma from "@/prisma/prisma";

export default async function UserInfo() {
    const { user } = await getSession();

    let artist_info = await prisma.artist.findFirst({
        where: {
            auth0id: user.sub
        }
    });

    if (!user) {
        return (
            <Standard />
        )
    }

    return (
        <Artist artist_handle={artist_info!.handle!} />
    )
}
