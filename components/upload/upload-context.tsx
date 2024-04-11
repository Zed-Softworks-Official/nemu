'use client'

import { createContext, Dispatch, SetStateAction, useContext, useState } from 'react'

type UploadContextType = {
    files: File[] | null
    setFiles: Dispatch<SetStateAction<File[]| null>>
}

const UploadContext = createContext<UploadContextType | undefined>(undefined)

export default function UploadProvider({ children }: { children: React.ReactNode }) {
    const [files, setFiles] = useState<File[] | null>(null)

    return (
        <UploadContext.Provider value={{ files, setFiles }}>
            {children}
        </UploadContext.Provider>
    )
}

export const useUploadContext = () => useContext(UploadContext)
