import React from "react";

import DefaultPageLayout from "@/app/(default)/layout";
import StepsLayout from "@/components/ArtistVerification/Layout/StepsLayout";

export default function VerificationLayout({ children, } : { children: React.ReactNode }) {
    return (
        <DefaultPageLayout>
            <div className="container mx-auto bg-fullwhite dark:bg-fullblack p-5 rounded-3xl">
                <div className="mb-10">
                    <h1 className="text-center">Artists Wanted!</h1>
                    <h2 className="text-center">Fill out this form to start the verification process!</h2>
                    <hr className="seperation" />
                </div>
                <div className="py-16 px-4 flex justify-center items-center w-full">
                    <StepsLayout>
                        {children}
                    </StepsLayout>
                </div>
            </div>
        </DefaultPageLayout>
    )
}