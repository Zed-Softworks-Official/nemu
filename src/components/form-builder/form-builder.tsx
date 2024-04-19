'use client'

import {
    DndContext,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core'

import Designer from '~/components/form-builder/designer/designer'
import SaveButton from '~/components/form-builder/nav/save-button'

import PreviewButton from '~/components/form-builder/nav/preview-button'

import DragOverlayWrapper from '~/components/form-builder/drag-overlay-wrapper'

import { RouterOutput } from '~/core/structures'
import { notFound } from 'next/navigation'

export default function FormBuilder({
    form
}: {
    form: RouterOutput['form']['get_form']
}) {
    if (!form) {
        return notFound()
    }

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

    return (
        <DndContext sensors={sensors}>
            <main className="flex flex-col w-full min-h-[90rem]">
                <nav className="flex justify-between p-4 gap-3 items-center">
                    <div>
                        <h2 className="card-title">Form: {form?.name}</h2>
                        <p>Description: {form?.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <PreviewButton />
                        <SaveButton form_id={form?.id} />
                    </div>
                </nav>
                <div className="flex w-full flex-grow items-center justify-center relative overflow-y-auto h-[200px] bg-base-100 bg-[url(/bg/graph-paper.svg)] rounded-xl">
                    <Designer />
                </div>
            </main>
            <DragOverlayWrapper />
        </DndContext>
    )
}
