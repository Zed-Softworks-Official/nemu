import React  from "react";

import { getSession } from '@auth0/nextjs-auth0'

import prisma from "@/prisma/prisma";
import UserInfoMenu from "./UserInfoMenu";

export default async function UserInfo() {
    const session = await getSession();

    let artist_info = await prisma.artist.findFirst({
        where: {
            auth0id: session?.user?.sub
        }
    });

    return (
        <UserInfoMenu session={session ? true : false} artist={artist_info ? true : false} artist_handle={artist_info?.handle} />
    )
}
