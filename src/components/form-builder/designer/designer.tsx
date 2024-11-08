'use client'

import { useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'

import { type DragEndEvent, useDndMonitor, useDraggable, useDroppable } from '@dnd-kit/core'

import DesignerSidebar from '~/components/form-builder/designer/designer-sidebar'
import { useDesigner } from '~/components/form-builder/designer/designer-context'
import {
    type ElementsType,
    type FormElementInstance,
    FormElements
} from '~/components/form-builder/elements/form-elements'

import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'

export default function Designer() {
    const { elements, addElement, selectedElement, setSelectedElement, removeElement } =
        useDesigner()

    const droppable = useDroppable({
        id: 'designer-drop-area',
        data: {
            isDesignerDropArea: true
        }
    })

    useDndMonitor({
        onDragEnd: (event: DragEndEvent) => {
            const { active, over } = event
            if (!active || !over) return

            // Handle dropping over container
            const isDesignerBtnElement = active.data?.current?.isDesignerBtnElement as boolean
            const isDroppingOverDesignerDropArea = over.data?.current?.isDesignerDropArea as boolean

            // Dropping a sidebar btn element over designer drop area
            if (isDesignerBtnElement && isDroppingOverDesignerDropArea) {
                const type = active.data?.current?.type as ElementsType
                const newElement = FormElements[type].construct(
                    uuidv4().toString()
                )

                addElement(elements.length, newElement)
                return
            }

            // Handle dropping sidebar elements over designer elements
            const isDroppingOverTopHalf = over.data?.current?.isTopHalfDesignerElement as boolean
            const isDroppingOverBottomHalf =
                over.data?.current?.isBottomHalfDesignerElement as boolean

            // Dropping a sidebar btn element of another designer element
            if (
                isDesignerBtnElement &&
                (isDroppingOverTopHalf || isDroppingOverBottomHalf)
            ) {
                const type = active.data?.current?.type as ElementsType
                const newElement = FormElements[type].construct(
                    uuidv4().toString()
                )

                const overElementIndex = elements.findIndex(
                    (element) => element.id === over.data?.current?.elementId
                )
                if (overElementIndex === -1) {
                    throw new Error('Element not found!')
                }

                // Assume we're on the top half
                let indexForNewElement = overElementIndex
                // If we're on the bottom half
                if (isDroppingOverBottomHalf) {
                    // increase the index
                    indexForNewElement++
                }

                addElement(indexForNewElement, newElement)
                return
            }

            // Handle designer elements over designer elements
            const isDraggingDesignerElement = active.data?.current?.isDesignerElement as boolean 
            if (
                (isDroppingOverTopHalf || isDroppingOverBottomHalf) &&
                isDraggingDesignerElement
            ) {
                const activeId = active.data?.current?.elementId as string 
                const overId = over.data?.current?.elementId as string

                const activeElementIndex = elements.findIndex(
                    (element) => element.id === activeId
                )
                const overElementIndex = elements.findIndex(
                    (element) => element.id === overId
                )

                if (activeElementIndex === -1 || overElementIndex === -1) {
                    throw new Error('Element not found!')
                }

                const activeElement = { ...elements[activeElementIndex]! }
                removeElement(activeId)

                let indexForNewElement = overElementIndex
                if (isDroppingOverBottomHalf) {
                    indexForNewElement++
                }

                addElement(indexForNewElement, activeElement)
                return
            }
        }
    })

    return (
        <div className="flex w-full h-full">
            <div
                className="p-4 w-full"
                onMouseDown={() => {
                    if (selectedElement) setSelectedElement(null)
                }}
            >
                <div
                    ref={droppable.setNodeRef}
                    className={cn(
                        droppable.isOver && 'ring-2 ring-primary ring-inset',
                        'bg-base-300 max-w-[920px] h-full m-auto rounded-xl flex flex-col flex-grow items-center justify-start flex-1 overflow-y-auto  scrollbar-thin scrollbar-track-transparent scrollbar-thumb-base-100'
                    )}
                >
                    {!droppable.isOver && elements.length === 0 && (
                        <p className="text-3xl text-base-content flex flex-grow items-center font-bold">
                            Drop Here
                        </p>
                    )}
                    {droppable.isOver && elements.length === 0 && (
                        <div className="p-4 w-full">
                            <div className="h-[120px] rounded-xl bg-base-100"></div>
                        </div>
                    )}
                    {elements.length > 0 && (
                        <div className="flex flex-col w-full p-4 gap-2">
                            {elements.map((element: FormElementInstance) => (
                                <DesignerElementWrapper
                                    key={element.id}
                                    element={element}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <DesignerSidebar />
        </div>
    )
}

function DesignerElementWrapper({ element }: { element: FormElementInstance }) {
    const [mouseIsOver, setMouseIsOver] = useState(false)

    const { removeElement, setSelectedElement } = useDesigner()

    const DesignerElement = FormElements[element.type].designer_component

    const topHalf = useDroppable({
        id: element.id + '-top',
        data: {
            type: element.type,
            elementId: element.id,
            isTopHalfDesignerElement: true
        }
    })

    const bottomHalf = useDroppable({
        id: element.id + '-bottom',
        data: {
            type: element.type,
            elementId: element.id,
            isBottomHalfDesignerElement: true
        }
    })

    const draggable = useDraggable({
        id: element.id + '-drag-handler',
        data: {
            type: element.type,
            elementId: element.id,
            isDesignerElement: true
        }
    })

    if (draggable.isDragging) return null

    return (
        <div
            className="relative cursor-pointer rounded-[1.2rem] ring-1 ring-primary ring-inset"
            ref={draggable.setNodeRef}
            {...draggable.listeners}
            {...draggable.attributes}
            onMouseEnter={() => {
                setMouseIsOver(true)
            }}
            onMouseLeave={() => {
                setMouseIsOver(false)
            }}
            onMouseDown={(event) => {
                event.stopPropagation()

                setSelectedElement(element)
            }}
        >
            <div
                ref={topHalf.setNodeRef}
                className="absolute w-full h-1/2 rounded-t-xl z-20"
            ></div>
            <div
                ref={bottomHalf.setNodeRef}
                className="absolute w-full bottom-0 h-1/2 rounded-b-xl z-20"
            ></div>
            {mouseIsOver && (
                <>
                    <div className="absolute right-0 h-full z-20">
                        <Button
                            variant={'destructive'}
                            className="h-full rounded-l-none rounded-r-[1.2rem]"
                            onMouseDown={(event) => {
                                event.stopPropagation()

                                removeElement(element.id)
                            }}
                        >
                            <Trash2Icon className="h-8 w-8" />
                        </Button>
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse z-20">
                        <p className="text-sm">Click for properties or drag to move</p>
                    </div>
                </>
            )}
            {topHalf.isOver && (
                <div className="absolute top-0 w-full rounded-[1.2rem] rounded-b-none h-[10px] bg-primary z-20"></div>
            )}
            <div
                className={cn(
                    'flex w-full items-center rounded-xl pointer-events-none opacity-100',
                    mouseIsOver && 'opacity-30'
                )}
            >
                <DesignerElement elementInstance={element} />
            </div>
            {bottomHalf.isOver && (
                <div className="absolute bottom-0 w-full rounded-[1.2rem] rounded-t-none h-[10px] bg-primary z-20"></div>
            )}
        </div>
    )
}
