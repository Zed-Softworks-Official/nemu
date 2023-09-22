import Link from "next/link";
import React from "react";

export default function Footer() {
    return (
        <footer className="text-center py-10">
            <p>&copy; {new Date().getFullYear()} <Link href="https://zedsoftworks.com">Zed Softworks</Link></p>
        </footer>
    )
}