'use client'

import { DragEndEvent, useDndMonitor, useDroppable } from '@dnd-kit/core'
import DesignerSidebar from './designer-sidebar'
import classNames from '@/helpers/classnames'
import { DesignerContextType, useDesigner } from './designer-context'
import {
    ElementsType,
    FormElementInstance,
    FormElements
} from '../elements/form-elements'

import { v4 as uuidv4 } from 'uuid'

export default function Designer() {
    const { elements, addElement } = useDesigner() as DesignerContextType

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

            const isDesignerBtnElement = active.data?.current?.isDesignerBtnElement

            if (isDesignerBtnElement) {
                const type = active.data?.current?.type
                const newElement = FormElements[type as ElementsType].construct(
                    uuidv4().toString()
                )

                addElement(0, newElement)
            }
        }
    })

    return (
        <div className="flex w-full h-full">
            <div className="p-4 w-full">
                <div
                    ref={droppable.setNodeRef}
                    className={classNames(
                        droppable.isOver && 'ring-2 ring-primary/20',
                        'bg-base-300 max-w-[920px] h-full m-auto rounded-xl flex flex-col flex-grow items-center justify-start flex-1 overflow-y-auto'
                    )}
                >
                    {!droppable.isOver && elements.length === 0 && (
                        <p className="text-3xl text-base-content flex flex-grow items-center font-bold">
                            Drop Here
                        </p>
                    )}
                    {droppable.isOver && (
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
    const DesignerElement = FormElements[element.type].designer_component

    return <DesignerElement />
}
