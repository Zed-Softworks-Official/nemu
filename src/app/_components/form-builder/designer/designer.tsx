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
} from '~/app/_components/form-builder/elements/form-elements'

import { Button } from '~/app/_components/ui/button'
import { cn } from '~/lib/utils'
import { useState } from 'react'
import { useDesigner } from './designer-context'
import { createId } from '@paralleldrive/cuid2'
import { Trash2, X } from 'lucide-react'
import { Separator } from '../../ui/separator'

export function Designer() {
    const { elements, add_element, remove_element, set_selected_element } = useDesigner()

    const droppable = useDroppable({
        id: 'designer-drop-area',
        data: {
            is_designer_drop_area: true
        }
    })

    useDndMonitor({
        onDragEnd: (event) => {
            // Extract active (element being dragged) and over (element being dropped on) from the drag end event
            // These are provided by dnd-kit to help us handle drag and drop interactions
            const { active, over } = event
            // Return early if either active or over is missing since we can't process an incomplete drag operation
            if (!over || !active) return

            // Check if we're dragging a designer button element (from sidebar)
            // This indicates a new element is being added rather than reordering existing ones
            const isDesignerButtonElement = active.data.current
                ?.is_designer_button_element as boolean

            // Check if we're dropping over the main designer area
            // This is important for handling drops into an empty form
            const isDroppingOverDesignerDropArea = over.data?.current
                ?.is_designer_drop_area as boolean

            // Handle dropping a new element into the empty designer area
            // This creates and adds a new element at the end of the form when dropping on empty space
            if (isDesignerButtonElement && isDroppingOverDesignerDropArea) {
                const type = active.data.current?.type as ElementType
                const newElement = FormElements[type].construct(createId())

                add_element(elements.length, newElement)
            }

            // Check if dropping over top or bottom half of an existing element
            // This split allows us to provide more precise control over element placement
            const isDroppingOverTopHalf = over.data?.current?.is_top_half as boolean
            const isDroppingOverBottomHalf = over.data?.current?.is_bottom_half as boolean

            // Handle dropping a new element between existing elements
            // This creates a new element and places it either above or below an existing element
            if (
                isDesignerButtonElement &&
                (isDroppingOverTopHalf || isDroppingOverBottomHalf)
            ) {
                const type = active.data.current?.type as ElementType
                const newElement = FormElements[type].construct(createId())

                // Find the index of the element we're dropping over
                // This helps us determine where to insert the new element
                const overElementIndex = elements.findIndex(
                    (element) => element.id === over.data?.current?.element_id
                )

                if (overElementIndex === -1) {
                    throw new Error('Element not found!')
                }

                // Calculate insertion index based on whether dropping on top or bottom half
                // If dropping on top half, insert at the element's index
                // If dropping on bottom half, insert after the element
                let index = overElementIndex // Assume top half
                if (isDroppingOverBottomHalf) {
                    index = overElementIndex + 1
                }

                add_element(index, newElement)
            }

            // Handle reordering existing elements
            // This moves elements around within the form rather than creating new ones
            const isDesignerElement = active.data.current?.is_designer_element as boolean
            if (
                isDesignerElement &&
                (isDroppingOverTopHalf || isDroppingOverBottomHalf)
            ) {
                const activeId = active.data.current?.element_id as string
                const overId = over.data?.current?.element_id as string

                // Don't do anything if dropping element onto itself
                // This prevents unnecessary state updates and potential issues
                if (activeId === overId) return

                // Find indices of both elements to determine the move operation
                const activeElementIndex = elements.findIndex(
                    (element) => element.id === activeId
                )
                const overElementIndex = elements.findIndex(
                    (element) => element.id === overId
                )

                if (activeElementIndex === -1 || overElementIndex === -1) {
                    throw new Error('Element not found!')
                }

                // Create copy of element being moved to preserve its properties
                const activeElement = {
                    ...elements[activeElementIndex]
                }

                // Remove element from old position first to prevent duplicates
                remove_element(activeId)

                // Calculate new insertion index based on drop position
                // This ensures the element is placed exactly where the user intended
                let index = overElementIndex // Assume top half
                if (isDroppingOverBottomHalf) {
                    index = overElementIndex + 1
                }

                // Add element at new position to complete the reorder
                add_element(index, activeElement as FormElementInstance)
            }
        }
    })

    return (
        <div className="flex h-full w-full">
            <div className="w-full p-4" onClick={() => set_selected_element(null)}>
                <div
                    className={cn(
                        'bg-background m-auto flex h-full max-w-[920px] flex-1 grow flex-col items-center justify-start overflow-y-auto rounded-xl p-2',
                        droppable.isOver && 'ring-primary ring-2'
                    )}
                    ref={droppable.setNodeRef}
                >
                    {!droppable.isOver && elements.length === 0 && (
                        <p className="text-muted-foreground flex grow items-center text-3xl font-bold">
                            Drop Here
                        </p>
                    )}
                    {droppable.isOver && elements.length === 0 && (
                        <div className="w-full p-4">
                            <div className="bg-primary/20 h-[120px] rounded-md"></div>
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
            className="text-foreground ring-accent relative flex h-[120px] flex-col rounded-xl ring-1 ring-inset hover:cursor-pointer"
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
                <div className="bg-background-secondary/80 absolute h-full w-full">
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
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse">
                        <p className="text-muted-foreground text-sm">
                            Click for properties or drag to move
                        </p>
                    </div>
                </div>
            )}
            {top_half.isOver && (
                <div className="bg-primary absolute top-0 h-[7px] w-full rounded-t-xl rounded-b-none"></div>
            )}
            {bottom_half.isOver && (
                <div className="bg-primary absolute bottom-0 h-[7px] w-full rounded-t-none rounded-b-xl"></div>
            )}
            <div
                className={cn(
                    'bg-accent/40 pointer-events-none flex h-[120px] w-full items-center rounded-xl px-4 py-2 opacity-100',
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
        <aside className="border-muted bg-background-secondary flex h-full w-[400px] max-w-[400px] grow flex-col gap-2 overflow-y-auto border-l-2 p-4">
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
        <aside className="border-muted bg-background-secondary flex h-full w-[400px] max-w-[400px] grow flex-col gap-2 overflow-y-auto border-l-2 p-4">
            <h2 className="text-muted-foreground place-self-start text-lg font-medium">
                Layout Elements
            </h2>
            <Separator className="my-2" />
            <div className="grid grid-cols-1 place-items-center gap-2 md:grid-cols-2">
                <SidebarButtonElement form_element={FormElements.TitleField} />
                <SidebarButtonElement form_element={FormElements.SubtitleField} />
                <SidebarButtonElement form_element={FormElements.ParagraphField} />
                <SidebarButtonElement form_element={FormElements.SeparatorField} />
                <SidebarButtonElement form_element={FormElements.SpacerField} />
            </div>
            <h2 className="text-muted-foreground place-self-start text-lg font-medium">
                Field Elements
            </h2>
            <Separator className="my-2" />
            <div className="grid grid-cols-1 place-items-center gap-2 md:grid-cols-2">
                <SidebarButtonElement form_element={FormElements.TextField} />
                <SidebarButtonElement form_element={FormElements.NumberField} />
                <SidebarButtonElement form_element={FormElements.TextareaField} />
                <SidebarButtonElement form_element={FormElements.DateField} />
                <SidebarButtonElement form_element={FormElements.SelectField} />
                <SidebarButtonElement form_element={FormElements.CheckboxField} />
            </div>
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
                draggable.isDragging && 'ring-primary ring-2'
            )}
            variant={'outline'}
            {...draggable.listeners}
            {...draggable.attributes}
        >
            <Icon className="h-6! w-6! cursor-grab" />
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
                <div className="bg-accent pointer-events-none flex h-[120px] w-full rounded-xl border px-4 py-2 opacity-80">
                    <DesignerElementComponent element_instance={element} />
                </div>
            )
        }
    }

    return <DragOverlay>{node}</DragOverlay>
}
