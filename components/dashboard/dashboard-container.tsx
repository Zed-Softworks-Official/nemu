'use client'

import Link from 'next/link'
import { useState } from 'react'
import Modal from '../modal'
import DashboardBreadcrumbs from '../navigation/dashboard/breadcrumbs'
import { PlusCircleIcon } from 'lucide-react'

export default function DashboardContainer({
    title,
    modal,
    addButtonUrl,
    children
}: {
    title: string
    modal?: React.ReactNode
    addButtonUrl?: string
    children: React.ReactNode
}) {
    const [showModal, setShowModal] = useState(false)

    return (
        <main className="py-14 justify-around w-[90%] transition-all duration-200 ease-in-out relative">
            <div className="bg-base-300 p-10 mx-auto rounded-xl">
                <div className="flex justify-between items-center">
                    <h1 className="font-bold text-2xl">{title}</h1>
                    {addButtonUrl && (
                        <Link href={addButtonUrl} className="btn btn-square btn-primary">
                            <PlusCircleIcon className="w-6 h-6" />
                        </Link>
                    )}
                    {modal && (
                        <>
                            <div className="">
                                <button
                                    type="button"
                                    className="btn btn-square btn-primary"
                                    onClick={() => setShowModal(true)}
                                >
                                    <PlusCircleIcon className="w-6 h-6" />
                                </button>
                            </div>
                            <Modal
                                showModal={showModal}
                                setShowModal={setShowModal}
                                classNames="bg-base-300"
                            >
                                {modal}
                            </Modal>
                        </>
                    )}
                </div>
                <div className="divider"></div>
                {children}
            </div>
        </main>
    )
}
