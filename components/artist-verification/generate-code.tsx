'use client'

import { api } from '@/core/trpc/react'
import { useState } from 'react'
import { toast } from 'react-toastify'

export default function GenerateAristCode() {
    const [generatedCode, setGeneratedCode] = useState(crypto.randomUUID())
    const [generating, setGenerating] = useState(false)

    const mutation = api.artist_code.set_artist_code.useMutation({
        onSuccess(res) {
            setGenerating(false)
            setGeneratedCode(res.generated_code)
        },
        onError(e) {
            setGenerating(false)
            toast(e.message, { theme: 'dark', type: 'error' })
        }
    })

    return (
        <div className="card bg-base-300 shadow-xl">
            <div className="card-body">
                <h2 className="card-title">Generate Artist Code</h2>
                <div className="divider"></div>
                <div className="join">
                    <input
                        type="text"
                        value={generatedCode}
                        placeholder="No code generated yet!"
                        readOnly
                        className="input w-full join-item"
                    />
                    <button
                        className="btn"
                        onClick={async () => {
                            await navigator.clipboard.writeText(generatedCode)
                            toast('Copied to clipboard', {
                                type: 'info',
                                theme: 'dark'
                            })
                        }}
                    >
                        Copy
                    </button>
                </div>
                <button
                    className="btn btn-primary btn-wide"
                    onClick={() => {
                        setGenerating(true)
                        mutation.mutate()
                    }}
                    disabled={generating}
                >
                    Generate
                </button>
            </div>
        </div>
    )
}
