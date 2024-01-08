import { Active, DragOverlay, useDndMonitor } from '@dnd-kit/core'
import { useState } from 'react'
import { SidebarBtnElementOverlay } from './designer/sidebar-btn-element'
import { ElementsType, FormElements } from './elements/form-elements'

export default function DragOverlayWrapper() {
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

    return <DragOverlay>{node}</DragOverlay>
}
