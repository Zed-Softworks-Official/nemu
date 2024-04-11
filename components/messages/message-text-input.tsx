'use client'

import { PaperclipIcon } from "lucide-react"


export default function MessageTextInput({ other_username }: { other_username: string }) {
    return (
        <div className="absolute bottom-0 w-full">
            <input
                type="text"
                className="input input-lg bg-base-300 rounded-t-none rounded-bl-none w-full relative"
                placeholder={`Message ${other_username}`}
            />
            <div className="flex gap-2 absolute top-2 right-2">
                <div className="tooltip" data-tip="Upload Attachment">
                    <button type="button" className="btn btn-ghost">
                        <PaperclipIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    )
}
