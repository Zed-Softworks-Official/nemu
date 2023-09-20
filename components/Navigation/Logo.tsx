import React from "react";

import Link from "next/link";

export default function Logo() {
    return (
        <div className="logo inline">
            <h1>
                <Link href={"/"}>
                    Nemu
                </Link>
            </h1>
        </div>
    )
}