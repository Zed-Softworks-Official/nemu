'use client'

import { useDraggable } from '@dnd-kit/core'
import { FormElement } from '~/components/form-builder/elements/form-elements'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

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
        <Button
            ref={draggable.setNodeRef}
            {...draggable.listeners}
            {...draggable.attributes}
            variant={'outline'}
            className={cn(
                draggable.isDragging && 'ring-2 ring-primary',
                'h-28 cursor-grab flex-col'
            )}
        >
            <Icon className="h-8 w-8 cursor-grab" />
            {label}
        </Button>
    )
}

export function SidebarBtnElementOverlay({ formElement }: { formElement: FormElement }) {
    const { label, icon: Icon } = formElement.designer_btn_element

    return (
        <Button variant={'outline'} className="h-28 cursor-grab">
            <Icon className="h-8 w-8 cursor-grab" />
            {label}
        </Button>
    )
}
