'use client'

import type { KanbanTask } from '~/core/structures'
import type { UniqueIdentifier } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { Button } from '../ui/button'

export default function KanbanItemComponent({
    item_data,
    DeleteTask,
    UpdateTask
}: {
    item_data: KanbanTask
    DeleteTask: (id: UniqueIdentifier) => void
    UpdateTask: (id: UniqueIdentifier, content: string) => void
}) {
    const [mouseIsOver, setMouseIsOver] = useState(false)
    const [editMode, setEditMode] = useState(false)

    const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
        useSortable({
            id: item_data.id,
            data: {
                type: 'Task',
                item_data
            },
            disabled: editMode
        })

    const style = {
        transition,
        transform: CSS.Transform.toString(transform)
    }

    function ToggleEditMode() {
        setEditMode(!editMode)
        setMouseIsOver(false)
    }

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="card border-2 border-primary bg-base-100 opacity-60 shadow-xl"
            >
                <div className="card-body">
                    <div className="flex h-6 max-h-full w-full items-center justify-between"></div>
                </div>
            </div>
        )
    }

    if (editMode) {
        return (
            <div
                className="card cursor-grab break-inside-avoid bg-base-100 shadow-xl hover:ring-2 hover:ring-inset hover:ring-primary"
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
            >
                <div className="card-body">
                    <div className="flex h-6 w-full items-center justify-between">
                        <textarea
                            className="textarea textarea-primary w-full resize-none focus:outline-none"
                            defaultValue={item_data.content}
                            placeholder="Type something here"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.shiftKey) {
                                    UpdateTask(item_data.id, e.currentTarget.value)
                                    ToggleEditMode()
                                }
                            }}
                            onBlur={(e) => {
                                UpdateTask(item_data.id, e.currentTarget.value)
                                ToggleEditMode()
                            }}
                        ></textarea>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <>
            <div
                onMouseEnter={() => {
                    setMouseIsOver(true)
                }}
                onMouseLeave={() => {
                    setMouseIsOver(false)
                }}
                onMouseDown={() => {
                    ToggleEditMode()
                }}
                className={cn(
                    'card cursor-grab break-inside-avoid bg-base-100 shadow-xl hover:ring-2 hover:ring-inset hover:ring-primary'
                )}
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
            >
                <div className="card-body">
                    <div className="flex h-6 max-h-full w-full items-center justify-between">
                        <p className="w-full whitespace-pre-wrap">{item_data.content}</p>
                        {mouseIsOver && (
                            <Button
                                variant={'ghost'}
                                onMouseDown={() => DeleteTask(item_data.id)}
                            >
                                <Trash2Icon className="h-6 w-6" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
