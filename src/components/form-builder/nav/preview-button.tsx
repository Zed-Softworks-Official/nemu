'use client'

import { useDesigner } from '~/components/form-builder/designer/designer-context'
import { FormElements } from '~/components/form-builder/elements/form-elements'
import { EyeIcon } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '~/components/ui/alert-dialog'

export default function PreviewButton() {
    const { elements } = useDesigner()

    return (
        <AlertDialog>
            <AlertDialogTrigger className="btn btn-primary">
                <EyeIcon className="w-6 h-6 text-white" />
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your
                        account and remove your data from our servers.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        // <>
        //     <button
        //         type="button"
        //         className="btn btn-accent btn-outline"
        //         onClick={() => setShowModal(true)}
        //     >
        //         <EyeIcon className="w-6 h-6 swap-off fill-current" />
        //     </button>
        //     <Modal showModal={showModal} setShowModal={setShowModal}>
        //         <h2 className="card-title">Form Preview</h2>
        //         <p className="text-base-content/80">
        //             This is how your form will look to users that would like to commission
        //             you!
        //         </p>
        //         <div className="divider"></div>
        //         <div className="flex flex-col w-full p-5 gap-4 bg-base-300 rounded-xl h-full max-w-xl mx-auto">
        //             <div className='flex flex-col justify-center items-center gap-3'>
        //                 <NemuImage src={'/nemu/fillout.png'} alt='Nemu filling out form' width={200} height={200} />
        //                 <h2 className="card-title">You're almost there!</h2>
        //                 <p className="text-base-content/80">You just need to fill out this form provided by the artist to get a better understanding of your commission.</p>
        //                 <div className='divider'></div>
        //             </div>
        //             {elements.map(element => {
        //                 const FormComponent = FormElements[element.type].form_component

        //                 return <FormComponent key={element.id} elementInstance={element} />
        //             })}
        //         </div>
        //     </Modal>
        // </>
    )
}
