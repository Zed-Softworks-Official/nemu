'use client'

import React, { FormEvent, useEffect, useState } from "react"
import { useDropzone } from 'react-dropzone';

import { CheckCircleIcon } from "@heroicons/react/20/solid";

export default function AddPortfolioItem() {
    const [filePreview, setfilePreview] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { acceptedFiles, getRootProps, getInputProps } = useDropzone({
        maxFiles: 1,
        accept: {
            'image/*': []
        },
        onDrop: acceptedFiles => {
            setfilePreview(URL.createObjectURL(acceptedFiles[0]));
        }
    });

    const thumbs = (
        <div className="inline-flex border-2 border-solid border-white mb-8 mr-8 w-full h-full box-border">
            <div className="flex min-w-0 overflow-hidden">
                <img className="block w-auto h-full" src={filePreview} />
            </div>
        </div>
    );

    useEffect(() => {
        return () => URL.revokeObjectURL(filePreview);
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsLoading(true);

        try {
            const formData = new FormData(event.currentTarget);

            let filename = crypto.randomUUID();
            console.log(acceptedFiles);

        } catch (error) {
            console.log(error);
        }
    }

    return (
        <main className="py-14 justify-around mr-24 ml-[26rem]">
            <div className="dark:bg-fullblack bg-fullwhite p-10 mx-auto rounded-3xl">
                <h1 className="font-bold text-2xl text-center">Add Portfolio Item</h1>
                <hr className="seperation" />
                <form className="max-w-lg mx-auto" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="title" className="block mb-5">Title: </label>
                        <input name="title" placeholder="Title" type="text" className="bg-charcoal p-5 rounded-xl w-full" />
                    </div>
                    <div className="mt-16">
                        <label className="block mb-5">Image:</label>

                        <div className="mx-auto p-10 border-dashed border-white border-opacity-50 border-4 focus:border-primary bg-charcoal text-center border-spacing-28" {...getRootProps()}>
                            <input name="dropzone-file" type="file" {...getInputProps()} />
                            <p>Drag a file to upload!</p>
                        </div>

                        <aside className="flex flex-col flex-wrap mt-16">
                            <label className="block mb-5">Preview: </label>
                            {thumbs}
                        </aside>

                    </div>
                    <div className="flex flex-row items-center justify-center my-5">
                        <button type="submit" className="bg-primary p-5 rounded-3xl m-5" disabled={isLoading}>
                            <CheckCircleIcon className="w-6 h-6 inline mr-3" />
                            Create Item
                        </button>
                    </div>
                </form>
            </div>
        </main>
    )
}