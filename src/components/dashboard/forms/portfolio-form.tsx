'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2Icon, XCircleIcon } from 'lucide-react'
import { useState } from 'react'

import { toast } from 'sonner'

import { useUploadThingContext } from '~/components/files/uploadthing-context'
import NemuUploadDropzone from '~/components/files/nemu-dropzone'
import NemuUploadPreview from '~/components/files/nemu-upload-preview'
import NemuUploadProgress from '~/components/files/nemu-upload-progress'

import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Input } from '~/components/ui/input'

import { set_portfolio_item } from '~/server/actions/portfolio'

export function PortfolioCreateForm() {
    const [title, setTitle] = useState('')
    const [pending, setPending] = useState(false)

    const { uploadImages, images } = useUploadThingContext()
    const router = useRouter()

    async function CreatePortfolioItem() {
        setPending(true)
        const toast_id = toast.loading('Uploading Image')

        if (images.length === 0) {
            toast.error('Please choose an image', {
                id: toast_id
            })

            return
        }

        const res = await uploadImages()

        if (!res) {
            toast.error('Failed to upload image!', {
                id: toast_id
            })

            setPending(false)
            return
        }

        toast.loading('Creating Portfolio Item', {
            id: toast_id
        })

        const result = await set_portfolio_item({
            title,
            image_url: res[0]!.url,
            ut_key: res[0]!.key
        })

        if (!result.success) {
            toast.error('Failed to create portfolio item!', {
                id: toast_id
            })

            setPending(false)
            return
        }

        toast.success('Portfolio Item Created!', {
            id: toast_id
        })

        setPending(false)
        router.push('/dashboard/portfolio')
    }

    return (
        <form className="mx-auto flex max-w-xl flex-col gap-5">
            <div className="form-control">
                <Label className="label">Title:</Label>
                <Input
                    placeholder="Title"
                    name="title"
                    onChange={(e) => setTitle(e.currentTarget.value)}
                />
            </div>
            <div className="form-control">
                <Label className="label">Image:</Label>
                <PortfolioUploadThing />
            </div>
            <div className="divider"></div>
            <div className="flex flex-row justify-between gap-5">
                <Link href={'/dashboard/portfolio'} className="btn btn-outline">
                    <XCircleIcon className="h-6 w-6" />
                    Cancel
                </Link>
                <Button
                    type="button"
                    disabled={pending}
                    onClick={() => CreatePortfolioItem()}
                >
                    <CheckCircle2Icon className="h-6 w-6" />
                    Create Portfolio Item
                </Button>
            </div>
        </form>
    )
}

export function PortfolioUpdateForm() {
    return <></>
}

function PortfolioUploadThing() {
    const { images, setImages } = useUploadThingContext()

    return (
        <div className="flex flex-col gap-5">
            <NemuUploadProgress />
            <NemuUploadDropzone setCurrentImages={setImages} />
            <NemuUploadPreview
                images={images}
                onDelete={(index) => {
                    setImages((prev) => {
                        prev.splice(index, 1)
                        return prev
                    })
                }}
            />
        </div>
    )
}
