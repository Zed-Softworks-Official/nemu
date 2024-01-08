'use client'

import { Active, DragOverlay, useDndMonitor } from '@dnd-kit/core'
import { useState } from 'react'
import { SidebarBtnElementOverlay } from './designer/sidebar-btn-element'
import { ElementsType, FormElements } from './elements/form-elements'
import { DesignerContextType, useDesigner } from './designer/designer-context'

export default function DragOverlayWrapper() {
    const { elements } = useDesigner() as DesignerContextType
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
    const isSidebarBtnElement = draggedItem?.data?.current?.isDesignerBtnElement

    if (isSidebarBtnElement) {
        const type = draggedItem.data?.current?.type as ElementsType
        node = <SidebarBtnElementOverlay formElement={FormElements[type]} />
    }

    const isDesignerElement = draggedItem.data?.current?.isDesignerElement
    if (isDesignerElement) {
        const elementId = draggedItem.data?.current?.elementId
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
