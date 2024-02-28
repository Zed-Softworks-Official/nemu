'use client'

import { AWSFileModification } from '@/core/structures'
import { createContext, useContext, useState, Dispatch, SetStateAction } from 'react'

type FormContextType = {
    image?: File | undefined
    setImage?: Dispatch<SetStateAction<File | undefined>>

    additionalImages?: AWSFileModification[] | undefined
    setAdditionalImages?: Dispatch<SetStateAction<AWSFileModification[] | undefined>>
}

const FormContext = createContext<FormContextType>({})

export const FormProvider = ({ children }: { children: React.ReactNode }) => {
    const [image, setImage] = useState<File>()
    const [additionalImages, setAdditionalImages] = useState<AWSFileModification[] | undefined>([])

    return <FormContext.Provider value={{ image, setImage, additionalImages, setAdditionalImages }}>{children}</FormContext.Provider>
}

export const useFormContext = () => useContext(FormContext)
