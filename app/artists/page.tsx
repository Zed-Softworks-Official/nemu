import Link from "next/link"
import React from "react"
import DefaultPageLayout from "../(default)/layout"

export default function Artists() {
    return (
        <DefaultPageLayout>
            <h1>Hello, World!</h1>
            <Link href={'/artists/verify'}>Click here to become an artist</Link>
        </DefaultPageLayout>
        
    )
}