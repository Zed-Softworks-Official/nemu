import React from "react";

import DefaultPageLayout from "@/app/(default)/layout";
import ArtistApplyButton from "@/components/ArtistVerification/ArtistApplyButton";

export default async function Artists() {
    return (
        <DefaultPageLayout>
            <h1>Hello, World!</h1>
            <ArtistApplyButton />
        </DefaultPageLayout>
        
    )
}