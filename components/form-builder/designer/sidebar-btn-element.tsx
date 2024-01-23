'use client'

import { useDraggable } from '@dnd-kit/core'
import { FormElement } from '../elements/form-elements'
import classNames from '@/core/helpers'

export default function SidebarBtnElement({ formElement }: { formElement: FormElement }) {
    const { label, icon: Icon } = formElement.designer_btn_element
    const draggable = useDraggable({
        id: `designer-btn-${formElement.type}`,
        data: {
            type: formElement.type,
            isDesignerBtnElement: true
        }
    })

    return (
        <button
            ref={draggable.setNodeRef}
            {...draggable.listeners}
            {...draggable.attributes}
            className={classNames(
                draggable.isDragging && 'ring-2 ring-primary',
                'btn btn-outline h-28 btn-accent cursor-grab flex-col'
            )}
        >
            <Icon className="h-8 w-8 cursor-grab" />
            {label}
        </button>
    )
}

export function SidebarBtnElementOverlay({ formElement }: { formElement: FormElement }) {
    const { label, icon: Icon } = formElement.designer_btn_element

    return (
        <button className="btn btn-outline h-28 btn-accent cursor-grab">
            <Icon className="h-8 w-8 cursor-grab" />
            {label}
        </button>
    )
}
