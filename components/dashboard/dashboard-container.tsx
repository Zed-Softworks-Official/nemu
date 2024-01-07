'use client'

import Link from 'next/link'
import { PlusCircleIcon } from '@heroicons/react/20/solid'

export default function DashboardContainer({
    title,
    addButtonUrl,
    modal,
    children
}: {
    title: string
    addButtonUrl?: string
    modal?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <main className="py-14 justify-around w-[80%]">
            <div className="dark:bg-fullblack bg-fullwhite p-10 mx-auto rounded-3xl">
                <div className="pb-10">
                    <h1 className="font-bold text-2xl text-center">{title}</h1>
                    <hr className="seperation" />
                </div>
                {addButtonUrl && (
                    <div className="absolute bottom-20 right-20">
                        <Link
                            href={addButtonUrl}
                            className="btn btn-square btn-primary btn-lg"
                        >
                            <PlusCircleIcon className="w-10 h-10 inline " />
                        </Link>
                    </div>
                )}
                {modal && (
                    <>
                        <div className="absolute bottom-20 right-20">
                            <button
                                type="button"
                                className="btn btn-square btn-primary btn-lg"
                                onClick={() =>
                                    (
                                        document.getElementById(
                                            'form_create_modal'
                                        ) as HTMLDialogElement
                                    ).showModal()
                                }
                            >
                                <PlusCircleIcon className="w-10 h-10 inline " />
                            </button>
                        </div>
                        <dialog id="form_create_modal" className="modal">
                            <div className="modal-box bg-base-300">{modal}</div>
                            <form method="dialog" className="modal-backdrop">
                                <button>close</button>
                            </form>
                        </dialog>
                    </>
                )}
                {children}
            </div>
        </main>
    )
}
