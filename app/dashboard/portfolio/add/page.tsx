'use client'

import { CheckCircleIcon } from "@heroicons/react/20/solid";
import React, { useState } from "react"
import { useDropzone } from 'react-dropzone';

export default function AddPortfolioItem() {
    const [file, setFile] = useState({});
    const { getRootProps, getInputProps } = useDropzone({
        maxFiles: 1,
        accept: {
            'image/*': []
        },
        onDrop: acceptedFiles => {
            setFile(acceptedFiles.map(image => Object.assign(image, {
                preview: URL.createObjectURL(image)
            })))
        }
    });

    const thumbs = (
        <div className="">
            <img src={file.preview} />
        </div>
    );

    return (
        <main className="py-14 justify-around mr-24 ml-[26rem]">
            <div className="dark:bg-fullblack bg-fullwhite p-10 mx-auto rounded-3xl">
                <h1 className="font-bold text-2xl text-center">Add Portfolio Item</h1>
                <hr className="seperation" />
                <form className="max-w-lg mx-auto" method="post" action="/api/artist/forms/portfolio">
                    <div>
                        <label htmlFor="title" className="block mb-5">Title: </label>
                        <input name="title" placeholder="Title" type="text" className="bg-charcoal p-5 rounded-xl w-full" />
                    </div>
                    <div className="my-5">
                        <label className="block mb-5">Image:</label>
                        {thumbs}

                        <div className="mx-auto p-10 border-dashed border-white border-opacity-50 border-4 focus:border-primary bg-charcoal text-center border-spacing-28" {...getRootProps()}>
                            <input name="dropzone-file" type="file" {...getInputProps()} />
                            <p>Drag a file to upload!</p>
                        </div>

                    </div>
                    <div className="flex flex-row items-center justify-center my-5">
                        <button type="submit" className="bg-primary p-5 rounded-3xl m-5">
                            <CheckCircleIcon className="w-6 h-6 inline mr-3" />
                            Create Item
                        </button>
                    </div>
                </form>
            </div>
        </main>
    )
}