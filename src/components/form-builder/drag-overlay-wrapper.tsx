'use client'

import { useState } from 'react'
import { type Active, DragOverlay, useDndMonitor } from '@dnd-kit/core'

import { SidebarBtnElementOverlay } from '~/components/form-builder/designer/sidebar-btn-element'
import { type ElementsType, FormElements } from '~/components/form-builder/elements/form-elements'
import { useDesigner } from '~/components/form-builder/designer/designer-context'

export default function DragOverlayWrapper() {
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

    let node = <div>No Drag Overlay</div>
    const isSidebarBtnElement = draggedItem?.data?.current?.isDesignerBtnElement as boolean

    if (isSidebarBtnElement) {
        const type = draggedItem.data?.current?.type as ElementsType
        node = <SidebarBtnElementOverlay formElement={FormElements[type]} />
    }

    const isDesignerElement = draggedItem.data?.current?.isDesignerElement as boolean
    if (isDesignerElement) {
        const elementId = draggedItem.data?.current?.elementId as string
        const element = elements.find((el) => el.id === elementId)

        if (!element) {
            node = <div>Element not found!</div>
        } else {
            const DesignerElementComponent = FormElements[element.type].designer_component

            node = (
                <div className="flex w-full items-center rounded-xl pointer-events-none opacity-80">
                    <DesignerElementComponent elementInstance={element} />
                </div>
            )
        }
    }

    return <DragOverlay>{node}</DragOverlay>
}
