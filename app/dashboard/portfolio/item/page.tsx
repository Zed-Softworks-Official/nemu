'use client'

import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/20/solid";
import { toast } from "react-toastify"

export default function PortfolioItem() {
        const successClick = () => toast('Portfolio Item Saved!', {type: 'success', theme: 'dark'});
        const errorClick = () => toast('Portfolio Item Not Saved :chibiLOL:', {type: 'error', theme: 'dark'});

    return (
        <main className="py-14 justify-around mr-24 ml-[26rem]">
            <div className="dark:bg-fullblack bg-fullwhite p-10 mx-auto rounded-3xl">
                <div className="flex flex-wrap">
                    <div className="mx-auto">
                        <img src="/1.png" className="rounded-3xl" />
                        <h1 className="font-bold text-2xl text-center">Pout</h1>
                    </div>
                </div>
                <div className="flex flex-row items-center justify-center">
                    <button onClick={successClick} className="bg-primary p-5 rounded-3xl m-5">
                        <CheckCircleIcon className="w-6 h-6 inline mr-3" />
                        Save Item
                    </button>
                    <button onClick={errorClick} className="bg-error p-5 rounded-3xl m-5">
                        <XCircleIcon className="w-6 h-6 inline mr-3" />
                        Cancel
                    </button>
                </div>
            </div>
        </main>
    )
}