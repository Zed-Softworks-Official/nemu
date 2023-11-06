'use client'

import { createContext, useContext, useState, Dispatch, SetStateAction } from 'react'

type FormContextType = {
    image?: File | undefined
    setImage?: Dispatch<SetStateAction<File | undefined>>
}

const FormContext = createContext<FormContextType>({})

export const FormProvider = ({
    children
}: {
    children: React.ReactNode
}) => {
    const [image, setImage] = useState<File>()

    return (
        <FormContext.Provider value={{image, setImage}}>
            {children}
        </FormContext.Provider>
    )
}

export const useFormContext = () => useContext(FormContext)