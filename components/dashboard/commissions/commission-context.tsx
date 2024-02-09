'use client'

import { FormSubmission } from '@prisma/client'
import { createContext, useContext, useState, Dispatch, SetStateAction } from 'react'

type DashboardCommissionContextType = {
    name: string
    setName: Dispatch<SetStateAction<string>>

    description: string
    setDescription: Dispatch<SetStateAction<string>>

    submissionCount: number
    setSubmissionCount: Dispatch<SetStateAction<number>>

    acceptedCount: number
    setAcceptedCount: Dispatch<SetStateAction<number>>

    rejectedCount: number
    setRejectedCount: Dispatch<SetStateAction<number>>

    formSubmissions: FormSubmission[]
    setFormSubmissions: Dispatch<SetStateAction<FormSubmission[]>>
}

const DashboardCommissionContext = createContext<DashboardCommissionContextType | null>(
    null
)

export function DashboardCommissionProvider({
    title,
    desc,
    submission_count,
    accepted_count,
    rejected_count,
    form_submissions,
    children
}: {
    title: string
    desc: string
    submission_count: number
    accepted_count: number
    rejected_count: number
    form_submissions: FormSubmission[]
    children: React.ReactNode
}) {
    const [name, setName] = useState(title)
    const [description, setDescription] = useState(desc)
    const [submissionCount, setSubmissionCount] = useState(submission_count)
    const [acceptedCount, setAcceptedCount] = useState(accepted_count)
    const [rejectedCount, setRejectedCount] = useState(rejected_count)
    const [formSubmissions, setFormSubmissions] = useState(form_submissions)

    return (
        <DashboardCommissionContext.Provider
            value={{
                name,
                setName,
                description,
                setDescription,
                submissionCount,
                setSubmissionCount,
                acceptedCount,
                setAcceptedCount,
                rejectedCount,
                setRejectedCount,
                formSubmissions,
                setFormSubmissions
            }}
        >
            {children}
        </DashboardCommissionContext.Provider>
    )
}

export const useDashboardCommissionContext = () => useContext(DashboardCommissionContext)
