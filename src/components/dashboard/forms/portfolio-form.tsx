'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2Icon, Save, Trash2, XCircleIcon } from 'lucide-react'
import { useState } from 'react'

import { toast } from 'sonner'

import { useUploadThingContext } from '~/components/files/uploadthing-context'
import NemuUploadDropzone from '~/components/files/nemu-dropzone'
import NemuUploadPreview from '~/components/files/nemu-upload-preview'
import NemuUploadProgress from '~/components/files/nemu-upload-progress'

import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Input } from '~/components/ui/input'

import { delete_portfolio_item, set_portfolio_item } from '~/server/actions/portfolio'
import NemuImage from '~/components/nemu-image'
import { ClientPortfolioItem } from '~/core/structures'

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

export function PortfolioUpdateForm(props: { portfolio_item: ClientPortfolioItem }) {
    const [title, setTitle] = useState(props.portfolio_item.title)
    const [pending, setPending] = useState(false)

    const router = useRouter()

    async function DeletePortfolioItem() {
        setPending(true)

        const toast_id = toast.loading('Deleting Portfolio Item!')

        const result = await delete_portfolio_item(props.portfolio_item.id)

        if (!result.success) {
            toast.error('Failed to delete portfolio item!', {
                id: toast_id
            })

            setPending(false)
            return
        }

        setPending(false)
        toast.success('Deleted Portfolio Item!')

        router.push('/dashboard/portfolio')
    }

    return (
        <form className="mx-auto flex max-w-xl flex-col gap-5">
            <div className="form-control">
                <Label className="label">Title:</Label>
                <Input
                    placeholder="Title"
                    name="title"
                    defaultValue={title}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                />
            </div>
            <div className="form-control">
                <NemuImage
                    src={props.portfolio_item.image.url}
                    alt={props.portfolio_item.title}
                    placeholder="blur"
                    blurDataURL={props.portfolio_item.image.blur_data}
                    width={1000}
                    height={1000}
                />
            </div>
            <div className="flex w-full flex-col items-center justify-between gap-5 sm:flex-row">
                <Link href={'/dashboard/portfolio'} className="btn btn-outline">
                    <XCircleIcon className="h-5 w-5" />
                    Cancel
                </Link>
                <div className="flex flex-col gap-5 sm:flex-row">
                    <Button
                        onClick={() => DeletePortfolioItem()}
                        variant={'destructive'}
                        type="button"
                        disabled={pending}
                    >
                        <Trash2 className="h-5 w-5" />
                        Delete
                    </Button>
                    <Button type="button" disabled={pending}>
                        <Save className="h-5 w-5" />
                        Save
                    </Button>
                </div>
            </div>
        </form>
    )
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
