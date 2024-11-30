'use client'

import { Eye, Save } from 'lucide-react'
import { type InferSelectModel } from 'drizzle-orm'
import { notFound } from 'next/navigation'

import {
    DndContext,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core'

import { type forms } from '~/server/db/schema'
import { Button } from '~/components/ui/button'
import { Designer, DragOverlayWrapper } from './designer'

export function FormBuilder(props: { form: InferSelectModel<typeof forms> }) {
    const mouseSensor = useSensor(MouseSensor, {
        activationConstraint: {
            distance: 10
        }
    })

    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: {
            delay: 250,
            tolerance: 5
        }
    })

    const sensors = useSensors(mouseSensor, touchSensor)

    if (!props.form) {
        return notFound()
    }

    return (
        <DndContext sensors={sensors}>
            <div className="flex w-full flex-col">
                <div className="flex items-center justify-between gap-3 border-b-2 p-4">
                    <h2 className="truncate font-medium">
                        <span className="mr-2 text-muted-foreground">Form:</span>
                        {props.form.name}
                    </h2>
                    <div className="flex items-center gap-2">
                        <PreviewButton />
                        <SaveButton />
                    </div>
                </div>
                <div className="relative mt-5 flex h-screen w-full flex-grow items-center justify-center overflow-y-auto rounded-xl bg-accent bg-[url(/bg/paper.svg)] dark:bg-[url(/bg/paper-dark.svg)]">
                    <Designer />
                </div>
            </div>
            <DragOverlayWrapper />
        </DndContext>
    )
}

function PreviewButton() {
    return (
        <Button variant={'outline'}>
            <Eye className="h-6 w-6" /> Preview
        </Button>
    )
}

function SaveButton() {
    return (
        <Button>
            <Save className="h-6 w-6" /> Save
        </Button>
    )
}
