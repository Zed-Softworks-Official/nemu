'use client'

import useSWR from 'swr'
import Designer from './designer/designer'
import SaveButton from './nav/save-button'

import { fetcher } from '@/helpers/fetcher'
import { useSession } from 'next-auth/react'

import PreviewButton from './nav/preview-button'
import { CommissionFormsResponse } from '@/helpers/api/request-inerfaces'
import {
    DndContext,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core'
import DragOverlayWrapper from './drag-overlay-wrapper'
import { DesignerProvider } from './designer/designer-context'

export default function FormBuilder({ form_id }: { form_id: string }) {
    const { data: session } = useSession()
    const { data } = useSWR<CommissionFormsResponse>(
        `/api/artist/${session?.user.user_id}/forms/${form_id}`,
        fetcher
    )
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
        <DesignerProvider>
            <DndContext sensors={sensors}>
                <main className="flex flex-col w-full min-h-[920px]">
                    <nav className="flex justify-between p-4 gap-3 items-center">
                        <h2>Form: {data?.form?.name}</h2>
                        <div className="flex items-center gap-2">
                            <PreviewButton />
                            <SaveButton />
                        </div>
                    </nav>
                    <div className="flex w-full flex-grow items-center justify-center relative overflow-y-auto h-[200px] bg-base-100 bg-[url(/bg/graph-paper.svg)] rounded-xl">
                        <Designer />
                    </div>
                </main>
                <DragOverlayWrapper />
            </DndContext>
        </DesignerProvider>
    )
}
