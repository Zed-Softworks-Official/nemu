'use client'

import {
    type Active,
    DragOverlay,
    useDndMonitor,
    useDraggable,
    useDroppable
} from '@dnd-kit/core'

import {
    type ElementType,
    type FormElement,
    type FormElementInstance,
    FormElements
} from './form-elements'

import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { useState } from 'react'
import { useDesigner } from './designer-context'
import { createId } from '@paralleldrive/cuid2'
import { Trash2, X } from 'lucide-react'
import { Separator } from '../ui/separator'

export function Designer() {
    const { elements, add_element, set_selected_element } = useDesigner()

    const droppable = useDroppable({
        id: 'designer-drop-area',
        data: {
            is_designer_drop_area: true
        }
    })

    useDndMonitor({
        onDragEnd: (event) => {
            const { active, over } = event
            if (!over || !active) return

            const is_designer_button_element = active.data.current
                ?.is_designer_button_element as boolean

            if (is_designer_button_element) {
                const type = active.data.current?.type as ElementType
                const new_element = FormElements[type].construct(createId())

                add_element(0, new_element)
            }
        }
    })

    return (
        <div className="flex h-full w-full">
            <div className="w-full p-4" onClick={() => set_selected_element(null)}>
                <div
                    className={cn(
                        'm-auto flex h-full max-w-[920px] flex-1 flex-grow flex-col items-center justify-start overflow-y-auto rounded-xl bg-background p-2',
                        droppable.isOver && 'ring-2 ring-primary'
                    )}
                    ref={droppable.setNodeRef}
                >
                    {!droppable.isOver && elements.length === 0 && (
                        <p className="flex flex-grow items-center text-3xl font-bold text-muted-foreground">
                            Drop Here
                        </p>
                    )}
                    {droppable.isOver && elements.length === 0 && (
                        <div className="w-full p-4">
                            <div className="h-[120px] rounded-md bg-primary/20"></div>
                        </div>
                    )}
                    {elements.length > 0 && (
                        <div className="flex w-full flex-col gap-4">
                            {elements.map((element) => (
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

function DesignerElementWrapper(props: { element: FormElementInstance }) {
    const [mouseOver, setMouseOver] = useState(false)
    const { remove_element, set_selected_element } = useDesigner()

    const DesignerElement = FormElements[props.element.type].designer_component

    const draggable = useDraggable({
        id: `${props.element.id}-drag-handler`,
        data: {
            type: props.element.type,
            element_id: props.element.id,
            is_designer_element: true
        }
    })

    const top_half = useDroppable({
        id: `${props.element.id}-top`,
        data: {
            type: props.element.type,
            element_id: props.element.id,
            is_top_half: true
        }
    })

    const bottom_half = useDroppable({
        id: `${props.element.id}-bottom`,
        data: {
            type: props.element.type,
            element_id: props.element.id,
            is_bottom_half: true
        }
    })

    if (draggable.isDragging) {
        return null
    }

    return (
        <div
            ref={draggable.setNodeRef}
            className="relative flex h-[120px] flex-col rounded-xl text-foreground ring-1 ring-inset ring-accent hover:cursor-pointer"
            onMouseEnter={() => setMouseOver(true)}
            onMouseLeave={() => setMouseOver(false)}
            onClick={(e) => {
                e.stopPropagation()

                set_selected_element(props.element)
            }}
            {...draggable.listeners}
            {...draggable.attributes}
        >
            <div
                className="absolute h-1/2 w-full rounded-t-xl"
                ref={top_half.setNodeRef}
            ></div>
            <div
                className="absolute bottom-0 h-1/2 w-full rounded-b-xl"
                ref={bottom_half.setNodeRef}
            ></div>
            {mouseOver && (
                <div className="absolute h-full w-full bg-background-secondary/80">
                    <div className="absolute right-0 h-full">
                        <Button
                            variant={'destructive'}
                            className="flex h-full justify-center rounded-xl rounded-l-none border"
                            onClick={(e) => {
                                e.stopPropagation()

                                remove_element(props.element.id)
                            }}
                        >
                            <Trash2 className="h-6 w-6" />
                        </Button>
                    </div>
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse">
                        <p className="text-sm text-muted-foreground">
                            Click for properties or drag to move
                        </p>
                    </div>
                </div>
            )}
            {top_half.isOver && (
                <div className="absolute top-0 h-[7px] w-full rounded-b-none rounded-t-xl bg-primary"></div>
            )}
            {bottom_half.isOver && (
                <div className="absolute bottom-0 h-[7px] w-full rounded-b-xl rounded-t-none bg-primary"></div>
            )}
            <div
                className={cn(
                    'pointer-events-none flex h-[120px] w-full items-center rounded-xl bg-accent/40 px-4 py-2 opacity-100',
                    mouseOver && 'opacity-30'
                )}
            >
                <DesignerElement element_instance={props.element} />
            </div>
        </div>
    )
}

function DesignerSidebar() {
    const { selected_element } = useDesigner()

    if (!selected_element) return <FormElementSidebar />

    return <PropertiesFormSidebar />
}

function PropertiesFormSidebar() {
    const { selected_element, set_selected_element } = useDesigner()

    if (!selected_element) return null

    const PropertiesForm = FormElements[selected_element.type].properties_component

    return (
        <aside className="flex h-full w-[400px] max-w-[400px] flex-grow flex-col gap-2 overflow-y-auto border-l-2 border-muted bg-background-secondary p-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">Properties</h2>
                <Button
                    variant={'outline'}
                    size={'icon'}
                    onClick={() => set_selected_element(null)}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
            <Separator className="my-2" />
            <PropertiesForm element_instance={selected_element} />
        </aside>
    )
}

function FormElementSidebar() {
    return (
        <aside className="flex h-full w-[400px] max-w-[400px] flex-grow flex-col gap-2 overflow-y-auto border-l-2 border-muted bg-background-secondary p-4">
            <h2 className="text-lg font-medium">Elements</h2>
            <Separator className="my-2" />
            <SidebarButtonElement form_element={FormElements.TextField} />
        </aside>
    )
}

function SidebarButtonElement(props: { form_element: FormElement }) {
    const draggable = useDraggable({
        id: `designer-button-${props.form_element.type}`,
        data: {
            type: props.form_element.type,
            is_designer_button_element: true
        }
    })
    const { icon: Icon, label } = props.form_element.designer_button

    return (
        <Button
            ref={draggable.setNodeRef}
            className={cn(
                'flex h-[120px] w-[120px] flex-col gap-2',
                draggable.isDragging && 'ring-2 ring-primary'
            )}
            variant={'outline'}
            {...draggable.listeners}
            {...draggable.attributes}
        >
            <Icon className="h-8 w-8 cursor-grab" />
            <p className="text-xs">{label}</p>
        </Button>
    )
}

function SidebarButtonElementDragOverlay(props: { form_element: FormElement }) {
    const draggable = useDraggable({
        id: `designer-button-${props.form_element.type}`,
        data: {
            type: props.form_element.type,
            is_designer_button_element: true
        }
    })
    const { icon: Icon, label } = props.form_element.designer_button

    return (
        <Button
            ref={draggable.setNodeRef}
            className="flex h-[120px] w-[120px] flex-col gap-2 opacity-80"
            variant={'outline'}
        >
            <Icon className="h-8 w-8 cursor-grab" />
            <p className="text-xs">{label}</p>
        </Button>
    )
}

export function DragOverlayWrapper() {
    const { elements } = useDesigner()
    const [draggedItem, setDraggedItem] = useState<Active | null>(null)

    useDndMonitor({
        onDragStart: (event) => {
            setDraggedItem(event.active)
        },
        onDragCancel: () => {
            setDraggedItem(null)
        },
        onDragEnd: () => {
            setDraggedItem(null)
        }
    })

    if (!draggedItem) return null

    let node = <>No Drag Overlay</>
    const isDesignerButtonElement = draggedItem?.data.current
        ?.is_designer_button_element as boolean

    if (isDesignerButtonElement) {
        const type = draggedItem?.data.current?.type as ElementType
        node = <SidebarButtonElementDragOverlay form_element={FormElements[type]} />
    }

    const isDesignerElement = draggedItem?.data.current?.is_designer_element as boolean
    if (isDesignerElement) {
        const element_id = draggedItem?.data.current?.element_id as string
        const element = elements.find((element) => element.id === element_id)
        if (!element) {
            node = <>Element not found!</>
        } else {
            const DesignerElementComponent = FormElements[element.type].designer_component
            node = (
                <div className="pointer-events-none flex h-[120px] w-full rounded-xl border bg-accent px-4 py-2 opacity-80">
                    <DesignerElementComponent element_instance={element} />
                </div>
            )
        }
    }

    return <DragOverlay>{node}</DragOverlay>
}
