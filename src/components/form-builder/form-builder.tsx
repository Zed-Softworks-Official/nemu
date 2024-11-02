'use client'

import dynamic from 'next/dynamic'
import {
    DndContext,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core'

import SaveButton from '~/components/form-builder/nav/save-button'

import PreviewButton from '~/components/form-builder/nav/preview-button'

import DragOverlayWrapper from '~/components/form-builder/drag-overlay-wrapper'

import type { InferSelectModel } from 'drizzle-orm'
import type { forms } from '~/server/db/schema'
import { notFound } from 'next/navigation'

const Designer = dynamic(() => import('~/components/form-builder/designer/designer'), {
    ssr: false
})

export default function FormBuilder({ form }: { form: InferSelectModel<typeof forms> }) {
    const mouseSensor = useSensor(MouseSensor, {
        activationConstraint: {
            distance: 10
        }
    })

    const touchSesnor = useSensor(TouchSensor, {
        activationConstraint: {
            delay: 300,
            tolerance: 5
        }
    })

    const sensors = useSensors(mouseSensor, touchSesnor)

    if (!form) {
        return notFound()
    }

    return (
        <DndContext sensors={sensors}>
            <main className="flex min-h-[90rem] w-full flex-col">
                <nav className="flex items-center justify-between gap-3 p-4">
                    <div>
                        <h2 className="card-title">Form: {form?.name}</h2>
                        <p>Description: {form?.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <PreviewButton />
                        <SaveButton form_id={form?.id} />
                    </div>
                </nav>
                <div className="relative flex h-[200px] w-full flex-grow items-center justify-center overflow-y-auto rounded-xl bg-base-100 bg-[url(/bg/graph-paper.svg)]">
                    <Designer />
                </div>
            </main>
            <DragOverlayWrapper />
        </DndContext>
    )
}
