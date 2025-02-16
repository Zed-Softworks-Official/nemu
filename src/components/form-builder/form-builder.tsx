'use client'

import { Eye, Save } from 'lucide-react'
import { type InferSelectModel } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { toast } from 'sonner'
import { useEffect } from 'react'

import {
    DndContext,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core'

import { type forms } from '~/server/db/schema'
import { Button } from '~/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger
} from '~/components/ui/dialog'

import { Designer, DragOverlayWrapper } from './designer/designer'
import { Separator } from '~/components/ui/separator'
import { useDesigner } from './designer/designer-context'
import { FormElements } from './elements/form-elements'
import { api } from '~/trpc/react'

export function FormBuilder(props: { form: InferSelectModel<typeof forms> }) {
    const { set_elements, set_selected_element } = useDesigner()

    useEffect(() => {
        if (!props.form.content) return

        set_elements(props.form.content)
        set_selected_element(null)
    }, [props.form.content, set_elements, set_selected_element])

    const mouseSensor = useSensor(MouseSensor, {
        activationConstraint: {
            distance: 10
        }
    })

    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: {
            delay: 250,
            tolerance: 5
        }
    })

    const sensors = useSensors(mouseSensor, touchSensor)

    if (!props.form) {
        return notFound()
    }

    return (
        <DndContext sensors={sensors}>
            <div className="flex w-full flex-col">
                <div className="flex items-center justify-between gap-3 border-b-2 p-4">
                    <h2 className="truncate font-medium">
                        <span className="mr-2 text-muted-foreground">Form:</span>
                        {props.form.name}
                    </h2>
                    <div className="flex items-center gap-2">
                        <PreviewButton />
                        <SaveButton form_id={props.form.id} />
                    </div>
                </div>
                <div className="relative mt-5 flex h-screen w-full grow items-center justify-center overflow-y-auto rounded-xl bg-accent bg-[url(/bg/paper.svg)] dark:bg-[url(/bg/paper-dark.svg)]">
                    <Designer />
                </div>
            </div>
            <DragOverlayWrapper />
        </DndContext>
    )
}

function PreviewButton() {
    const { elements } = useDesigner()

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant={'outline'}>
                    <Eye className="h-6 w-6" /> Preview
                </Button>
            </DialogTrigger>
            <DialogContent>
                <div className="flex flex-col gap-2 p-4">
                    <div className="flex flex-col gap-2">
                        <DialogTitle>Form Preview</DialogTitle>
                        <DialogDescription>
                            This is how your form will look like to your users
                        </DialogDescription>
                    </div>
                    <Separator />
                    <div className="flex flex-col gap-5">
                        {elements.map((element) => {
                            const FormElement = FormElements[element.type].form_component

                            return (
                                <FormElement
                                    key={element.id}
                                    element_instance={element}
                                />
                            )
                        })}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function SaveButton(props: { form_id: string }) {
    const { elements } = useDesigner()

    const saveForm = api.request.set_form_content.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Saving form')
            return { toast_id }
        },
        onSuccess: (_, __, { toast_id }) => {
            toast.success('Form saved', {
                id: toast_id
            })
        },
        onError: (_, __, context) => {
            if (!context?.toast_id) return

            toast.error('Failed to save form', {
                id: context.toast_id
            })
        }
    })

    return (
        <Button
            disabled={saveForm.isPending}
            onClick={() =>
                saveForm.mutate({ id: props.form_id, content: JSON.stringify(elements) })
            }
        >
            <Save className="h-6 w-6" /> Save
        </Button>
    )
}
