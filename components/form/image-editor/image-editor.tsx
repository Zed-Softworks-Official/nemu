'use client'

import { AWSFileModification, AWSLocations, AWSModification } from '@/core/structures'
import { InputHTMLAttributes, forwardRef, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useFormContext } from '../form-context'
import NemuImage from '../../nemu-image'
import { ClassNames } from '@/core/helpers'
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { Trash2Icon } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string
    location: AWSLocations
    images?: AWSFileModification[]
    edit_mode?: boolean
}

const ImageEditor = forwardRef<HTMLInputElement, InputProps>(({ label, images, location, edit_mode, ...props }, ref) => {
    const [filePreviews, setFilePreviews] = useState<AWSFileModification[]>(images ? images : [])
    const { setAdditionalImages } = useFormContext()
    const [totalFiles, setTotalFiles] = useState(0)
    const { acceptedFiles, getRootProps, getInputProps, isDragActive } = useDropzone({
        maxFiles: 5,
        multiple: true,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.svg', '.gif'],
        },
        onDrop: (acceptedFiles) => {
            if (totalFiles > 5) {
                return
            }

            if (acceptedFiles.length > 5) {
                return
            }

            const newArray = [...filePreviews]

            for (const file of acceptedFiles) {
                newArray.push({
                    file_key: crypto.randomUUID(),
                    aws_location: location,
                    updated_file: file,
                    modification: AWSModification.Added,
                    blob: URL.createObjectURL(file)
                })
            }

            setFilePreviews(newArray)
            setTotalFiles(totalFiles + acceptedFiles.length)
            setAdditionalImages!(newArray)
        }
    })

    function RemoveImage(index: number) {
        // TODO: Check if the image is actually there and wasn't uploaded on in the edit mode because then it will get all angy with me

        if (edit_mode) {
            // If we're in edit Mode, Update the additional images to mark the one removed as removed
            const updatedImages = [...filePreviews]
            updatedImages[index].modification = AWSModification.Removed
            setFilePreviews(updatedImages)
            setAdditionalImages!(updatedImages)
        } else {
            // If we're not in edit mode, just straight up remove the image from the additional image array since the server never had that image

            // Delete Previews
            const previews = [...filePreviews]
            previews.splice(index, 1)
            setFilePreviews(previews)
            setAdditionalImages!(previews)
        }

        // Delete Accepted files
        if (acceptedFiles.length != 0) {
            acceptedFiles.splice(index, 1)
        }
    }

    useEffect(() => {
        return () => {
            for (const preview of filePreviews) {
                URL.revokeObjectURL(preview.blob!)
            }
        }
    }, [filePreviews])

    const thumbs = (
        <div className="flex gap-5 overflow-x-auto">
            {(filePreviews as AWSFileModification[]).map((preview, i) => {
                if (preview.modification == AWSModification.Removed) {
                    return null
                }

                if (preview.featured) {
                    return null
                }

                return (
                    <>
                        <div key={preview.file_key} className="rounded-xl cursor-pointer overflow-hidden">
                            <div className="relative">
                                <NemuImage
                                    src={!preview.blob ? preview.signed_url! : preview.blob!}
                                    alt="image"
                                    width={200}
                                    height={200}
                                    className="block w-28 h-full"
                                />
                                <div className="absolute top-0 w-full h-full bg-base-300/80 transition-opacity duration-200 opacity-0 hover:opacity-100">
                                    <div className="flex w-full h-full justify-center items-center text-center">
                                        <button type="button" className="btn btn-error btn-circle" onClick={() => RemoveImage(i)}>
                                            <Trash2Icon className="w-6 h-6" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )
            })}
        </div>
    )

    function handleDragEnd(event: DragEndEvent) {
        const { over } = event
    }

    return (
        <DndContext onDragEnd={handleDragEnd}>
            <div className="flex flex-col gap-5 shadow-xl">
                <div className="form-control">
                    <label className="label">{label}:</label>
                    <div className="flex flex-col rounded-xl">
                        <div
                            className={ClassNames(
                                'mx-auto p-10 border-dashed border-opacity-50 border-2 rounded-t-xl focus:border-primary bg-base-100 text-center border-spacing-28 w-full transition-all duration-200 hover:border-primary cursor-pointer',
                                isDragActive ? 'border-primary' : 'border-base-content'
                            )}
                            {...getRootProps()}
                        >
                            <input ref={ref} type="file" {...props} {...getInputProps()} />
                            <p>Drag files to upload!</p>
                        </div>
                        <div className="bg-base-200 rounded-b-xl">
                            <div className="card-body">
                                {filePreviews.length == 0 ? (
                                    <h2 className="card-title text-base-content/80">No Files Uploaded!</h2>
                                ) : (
                                    <div className="form-control">
                                        <label className="label">Hover to delete items</label>
                                        {thumbs}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DndContext>
    )
})

export default ImageEditor
