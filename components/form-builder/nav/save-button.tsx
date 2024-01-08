'use client'

import { ArrowDownOnSquareStackIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'

export default function SaveButton() {
    const [isSaving, setIsSaving] = useState(false)

    return (
        <button
            className="btn btn-primary"
            onClick={() => setIsSaving(true)}
            disabled={isSaving}
        >
            {isSaving ? (
                <span className="loading loading-spinner"></span>
            ) : (
                <ArrowDownOnSquareStackIcon className="w-6 h-6" />
            )}
            Save
        </button>
    )
}
