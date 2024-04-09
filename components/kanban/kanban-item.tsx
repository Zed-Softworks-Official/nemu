'use client'

import { ClassNames } from '@/core/helpers'
import { KanbanTask } from '@/core/structures'
import { UniqueIdentifier } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TrashIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { api } from '@/core/trpc/react'
import { toast } from 'react-toastify'

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
    const [showModal, setShowModal] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const pathname = usePathname()
    const slug = pathname.substring(pathname.lastIndexOf('/') + 1, pathname.length)

    const mutation = api.commissions.accept_reject_commission.useMutation({
        onSuccess: () => {
            setSubmitting(false)
            toast('Commission Accepted!', { theme: 'dark', type: 'success' })
        },
        onError: (error) => {
            setSubmitting(false)
            toast(error.message, { theme: 'dark', type: 'error' })
        }
    })

    const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
        useSortable({
            id: item_data.id,
            data: {
                type: 'Task',
                item_data
            },
            disabled: editMode
        })

    const { replace } = useRouter()

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
                className="card shadow-xl bg-base-100 opacity-60 border-2 border-primary"
            >
                <div className="card-body">
                    <div className="flex justify-between items-center w-full h-6 max-h-full"></div>
                </div>
            </div>
        )
    }

    if (editMode) {
        return (
            <div
                className="card shadow-xl bg-base-100 cursor-grab hover:ring-inset hover:ring-primary hover:ring-2"
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
            >
                <div className="card-body">
                    <div className="flex justify-between items-center w-full h-6">
                        <textarea
                            className="textarea textarea-primary resize-none w-full focus:outline-none"
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
                onClick={() => {
                    ToggleEditMode()
                }}
                className={ClassNames(
                    'card shadow-xl bg-base-100 hover:ring-inset hover:ring-primary hover:ring-2 cursor-grab'
                )}
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
            >
                <div className="card-body">
                    <div className="flex justify-between items-center w-full h-6 max-h-full">
                        <p className="w-full whitespace-pre-wrap">{item_data.content}</p>
                        {mouseIsOver && (
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => {
                                    DeleteTask(item_data.id)
                                }}
                            >
                                <TrashIcon className="w-6 h-6" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
