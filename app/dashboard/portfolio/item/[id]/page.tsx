'use client'

import useSWR from "swr";
import { fetcher } from "@/helpers/fetcher";

import { useDashboardContext } from "@/components/Navigation/Dashboard/DashboardContext";
import { useDropzone } from 'react-dropzone';
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "react-toastify"
import { CheckCircleIcon, FireIcon, XCircleIcon } from "@heroicons/react/20/solid";

export default function PortfolioItem() {
    const { push } = useRouter();
    const pathname = usePathname();
    let lastSlash = pathname.lastIndexOf('/');
    let item_id = pathname.substring(lastSlash + 1, pathname.length + 1);

    const { handle } = useDashboardContext();
    const { data } = useSWR(`/api/artist/item/${handle}/portfolio/${item_id}`, fetcher);

    const [filePreview, setfilePreview] = useState('');
    const { acceptedFiles, getRootProps, getInputProps } = useDropzone({
        maxFiles: 1,
        accept: {
            'image/*': []
        },
        onDrop: acceptedFiles => {
            setfilePreview(URL.createObjectURL(acceptedFiles[0]));
        }
    });

    // Form Cancellation
    const errorClick = () => {
        toast('Action Canceled!', {type: 'error', theme: 'dark'});

        push('/dashboard/portfolio');
    }

    // Form Submit
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        try {
            toast.promise(fetch(`/api/artist/item/${handle}/portfolio/${item_id}/update`, {
                method: 'POST',
                body: formData
            }),
            {
                pending: 'Updating Portfolio Item',
                success: 'Portfolio Item Updated',
                error: 'Portfolio Item Failed to Update'
            },
            {
                theme: 'dark'
            });
        }  catch (error) {
            console.log(error);
        }

        push('/dashboard/portfolio');
    }

    return (
        <main className="py-14 justify-around mr-24 ml-[26rem]">
            <div className="dark:bg-fullblack bg-fullwhite p-10 mx-auto rounded-3xl">
                <form className="max-w-lg mx-auto" encType="multipart/form-data" onSubmit={handleSubmit}>
                    <div className="flex flex-wrap">
                        <div className="mx-auto">
                            <div className="mb-5">
                                <label htmlFor="title" className="block mb-5">Title:</label>
                                <input name="title" type="text" placeholder={data?.item.name} className="bg-charcoal p-5 rounded-xl w-full" />
                            </div>
                            <div className="mb-5">
                                <label className="block mb-5">Current Image: </label>
                                <img src={data?.item.signed_url} className="rounded-3xl" />
                            </div>
                            <div className="mb-5">
                                <label className="block mb-5">Upload New Image:</label>
                                <div className="mx-auto p-10 border-dashed border-white border-opacity-50 border-4 focus:border-primary bg-charcoal text-center border-spacing-28" {...getRootProps()}>
                                    <input name="dropzone-file" type="file" {...getInputProps()} />
                                    <p>Drag a file to upload!</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-row items-center justify-center">
                        <button type="submit" className="bg-primary p-5 rounded-3xl m-5">
                            <CheckCircleIcon className="w-6 h-6 inline mr-3" />
                            Save Item
                        </button>
                        <button type="button" onClick={errorClick} className="bg-error p-5 rounded-3xl m-5">
                            <XCircleIcon className="w-6 h-6 inline mr-3" />
                            Cancel
                        </button>
                    </div>
                    <div className="flex flex-row items-center justify-center">
                        <button type="button" onClick={errorClick} className=" bg-gradient-to-r from-error to-error/80 p-5 rounded-3xl m-5">
                            <FireIcon className="w-6 h-6 inline mr-3" />
                            Delete Item
                        </button>
                    </div>
                </form>
            </div>
        </main>
    )
}