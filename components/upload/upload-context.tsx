'use client'

import { createContext, Dispatch, SetStateAction, useContext, useState } from 'react'

type UploadContextType = {
    files: FileList | null
    setFiles: Dispatch<SetStateAction<FileList | null>>
}

const UploadContext = createContext<UploadContextType | undefined>(undefined)

export default function UploadProvider({ children }: { children: React.ReactNode }) {
    const [files, setFiles] = useState<FileList | null>(null)

    return (
        <UploadContext.Provider value={{ files, setFiles }}>
            {children}
        </UploadContext.Provider>
    )
}

export const useUploadContext = () => useContext(UploadContext)
