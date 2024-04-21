'use client'

import { useRouter } from 'next/navigation'
import { ElementRef, useEffect, useRef } from 'react'

export default function ParallelModal({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const dialogRef = useRef<ElementRef<'dialog'>>(null)

    useEffect(() => {
        if (!dialogRef.current?.open) {
            dialogRef.current?.showModal()
        }
    }, [])

    function onDismiss() {
        router.back()
    }

    return (
        <dialog ref={dialogRef} className="modal" open onClose={onDismiss}>
            <div className="modal-box bg-base-300 max-w-6xl w-full animate-pop-in transition-all duration-200 ease-in-out">
                {children}
            </div>
            <div className="modal-backdrop bg-black/80" onClick={onDismiss}></div>
        </dialog>
    )
}
