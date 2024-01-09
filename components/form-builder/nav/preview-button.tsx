'use client'

import { EyeIcon } from '@heroicons/react/20/solid'
import { DesignerContextType, useDesigner } from '../designer/designer-context'
import { useState } from 'react'
import Modal from '@/components/modal'
import { FormElements } from '../elements/form-elements'
import NemuImage from '@/components/nemu-image'

export default function PreviewButton() {
    const { elements } = useDesigner() as DesignerContextType
    const [showModal, setShowModal] = useState(false)

    return (
        <>
            <button
                type="button"
                className="btn btn-accent btn-outline"
                onClick={() => setShowModal(true)}
            >
                <EyeIcon className="w-6 h-6 swap-off fill-current" />
            </button>
            <Modal showModal={showModal} setShowModal={setShowModal}>
                <h2 className="card-title">Form Preview</h2>
                <p className="text-base-content/80">
                    This is how your form will look to users that would like to commission
                    you!
                </p>
                <div className="divider"></div>
                <div className="flex flex-col w-full p-5 gap-4 bg-base-300 rounded-xl h-full max-w-xl mx-auto">
                    <div className='flex flex-col justify-center items-center gap-3'>
                        <NemuImage src={'/nemu/fillout.png'} alt='Nemu filling out form' width={200} height={200} />
                        <h2 className="card-title">You're almost there!</h2>
                        <p className="text-base-content/80">You just need to fill out this form provided by the artist to get a better understanding of your commission.</p>
                        <div className='divider'></div>
                    </div>
                    {elements.map(element => {
                        const FormComponent = FormElements[element.type].form_component

                        return <FormComponent key={element.id} elementInstance={element} />
                    })}
                </div>
            </Modal>
        </>
    )
}
