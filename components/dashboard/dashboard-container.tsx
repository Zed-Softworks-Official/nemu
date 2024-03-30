'use client'

import Link from 'next/link'
import { PlusCircleIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import Modal from '../modal'
import DashboardBreadcrumbs from '../navigation/dashboard/breadcrumbs'
import { ClassNames } from '@/core/helpers'

export default function DashboardContainer({
    title,
    ignoreTitle,
    addButtonUrl,
    breadcrumbs,
    modal,
    children
}: {
    title: string
    ignoreTitle?: boolean
    addButtonUrl?: string
    breadcrumbs?: boolean
    modal?: React.ReactNode
    children: React.ReactNode
}) {
    const [showModal, setShowModal] = useState(false)

    return (
        <main className="py-14 justify-around w-[90%] transition-all duration-200 ease-in-out relative">
            <div className="bg-base-300 p-10 mx-auto rounded-xl">
                <div className={ClassNames(ignoreTitle ? '' : 'pb-10')}>
                    {breadcrumbs && (
                        <div className="xl:absolute xl:text-left block w- text-center">
                            <div className="flex flex-col justify-center items-start relative right-0 top-5">
                                <DashboardBreadcrumbs />
                            </div>
                        </div>
                    )}
                    {!ignoreTitle && (
                        <div className="flex flex-col justify-center items-center">
                            <h1 className="font-bold text-2xl text-center">{title}</h1>
                            <hr className="seperation" />
                        </div>
                    )}
                </div>
                {addButtonUrl && (
                    <div className="absolute bottom-20 right-20">
                        <Link href={addButtonUrl} className="btn btn-square btn-primary btn-lg">
                            <PlusCircleIcon className="w-10 h-10 inline " />
                        </Link>
                    </div>
                )}
                {modal && (
                    <>
                        <div className="absolute bottom-20 right-20">
                            <button type="button" className="btn btn-square btn-primary btn-lg" onClick={() => setShowModal(true)}>
                                <PlusCircleIcon className="w-10 h-10 inline " />
                            </button>
                        </div>
                        <Modal showModal={showModal} setShowModal={setShowModal} background="bg-base-300">
                            {modal}
                        </Modal>
                    </>
                )}
                {children}
            </div>
        </main>
    )
}
