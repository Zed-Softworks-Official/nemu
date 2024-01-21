'use client'

import Link from 'next/link'
import { PlusCircleIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import Modal from '../modal'

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
    const [showModal, setShowModal] = useState(false)

    return (
        <main className="py-14 justify-around w-[90%]">
            <div className="bg-base-300 p-10 mx-auto rounded-3xl">
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
                                onClick={() => setShowModal(true)}
                            >
                                <PlusCircleIcon className="w-10 h-10 inline " />
                            </button>
                        </div>
                        <Modal showModal={showModal} setShowModal={setShowModal} background='bg-base-300'>
                            {modal}
                        </Modal>
                    </>
                )}
                {children}
            </div>
        </main>
    )
}
