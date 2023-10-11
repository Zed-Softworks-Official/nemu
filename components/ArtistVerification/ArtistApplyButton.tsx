'use client'

import { useUser } from "@auth0/nextjs-auth0/client";
import { useRouter } from "next/navigation";

export default function ArtistApplyButton() {
    const { user } = useUser();
    const { push, replace } = useRouter();

    function routeUser() {
        if (!user) {
            return push('/api/auth/login');
        }
 
        return replace('/artists/apply/step-one');
     }

    return (
        <button onClick={routeUser} >Click here to become an artist</button>
    )
}