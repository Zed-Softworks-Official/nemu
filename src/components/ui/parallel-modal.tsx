'use client'

import { type ElementRef, useRef } from 'react'

import { useParallelModal } from '~/hooks/use-parallel-modal'
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog'

export default function ParallelModal(props: { children: React.ReactNode }) {
    const dialogRef = useRef<ElementRef<'dialog'>>(null)
    const { open, onDismiss } = useParallelModal(dialogRef)

    return (
        <Dialog open={open} onOpenChange={onDismiss}>
            <DialogContent className="flex h-full max-h-[80vh] w-full max-w-6xl flex-1 flex-shrink-0 flex-grow-0 overflow-y-hidden bg-background-tertiary">
                <DialogTitle className="sr-only">Modal</DialogTitle>
                {props.children}
            </DialogContent>
        </Dialog>
    )
}
