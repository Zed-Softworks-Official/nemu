import React from "react";

import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";


export default function Search() {
    return (
        <div className="w-full ml-20">
            <div className="flex w-full">
                <input type="text" placeholder="Search for an artist" className="bg-fullwhite border-white rounded-lg py-5 w-full font-semibold rounded-r-none pl-4" />
                <button className="relative right-0 bg-primary hover:bg-azure text-white p-5 rounded-l-none rounded-xl">
                    <MagnifyingGlassIcon className="h-6 w-6 text-white"/>
                </button>
            </div>
        </div>
    )
}