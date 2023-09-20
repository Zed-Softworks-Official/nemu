import React  from "react";

import { getSession } from '@auth0/nextjs-auth0'

import Artist from './Artist'
import Standard from "./Standard";

import prisma from "@/prisma/prisma";

export default async function UserInfo() {
    const session = await getSession();

    if (!session) {
        return (
            <Standard />
        )
    }

    let user = session.user!;
    console.log(user);


    // let artist_info = await prisma.artist.findFirst({
    //     where: {
    //         auth0id: user.sub
    //     }
    // });

    return (
        <Artist artist_handle={session['user'].handle} />
    )
}
