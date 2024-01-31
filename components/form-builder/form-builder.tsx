'use client'

import useSWR from 'swr'
import Designer from './designer/designer'
import SaveButton from './nav/save-button'

import { GraphQLFetcher } from '@/core/helpers'

import PreviewButton from './nav/preview-button'
import {
    DndContext,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core'
import DragOverlayWrapper from './drag-overlay-wrapper'
import { DesignerContextType, useDesigner } from './designer/designer-context'
import { useEffect } from 'react'
import Loading from '../loading'
import { useDashboardContext } from '../navigation/dashboard/dashboard-context'

export default function FormBuilder({ form_id }: { form_id: string }) {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
            form(artistId: "${artistId}", formId: "${form_id}") {
              name
              submissions
              description
              content
              commissionId
            }
          }`,
        GraphQLFetcher
    )
    const { setElements } = useDesigner() as DesignerContextType

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

    useEffect(() => {
        if (!isLoading) {
            const elements = JSON.parse(data?.form?.content!)
            setElements(elements)
        }
    }, [data, setElements])

    if (isLoading) {
        return <Loading />
    }

    return (
        <DndContext sensors={sensors}>
            <main className="flex flex-col w-full min-h-[90rem]">
                <nav className="flex justify-between p-4 gap-3 items-center">
                    <h2>Form: {data?.form?.name}</h2>
                    <div className="flex items-center gap-2">
                        <PreviewButton />
                        <SaveButton form_id={form_id} />
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
