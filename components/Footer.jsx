import React from "react";

export default function Footer() {
    return (
        <footer className="text-center py-10">
            <p>&copy; {new Date().getFullYear()} <a href="https://zedsoftworks.com">Zed Softworks</a></p>
        </footer>
    )
}