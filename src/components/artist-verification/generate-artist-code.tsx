'use client'

import { ClipboardIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { nemu_toast } from '~/lib/utils'
import { api } from '~/trpc/react'

export default function GenerateAristCode() {
    const [generatedCode, setGeneratedCode] = useState(crypto.randomUUID())
    const [generating, setGenerating] = useState(false)
    const { resolvedTheme } = useTheme()

    const mutation = api.verification.set_artist_code.useMutation({
        onSuccess(res) {
            setGenerating(false)
            setGeneratedCode(res.generated_code)
        },
        onError(e) {
            setGenerating(false)
            nemu_toast(e.message, { theme: resolvedTheme, type: 'error' })
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
                            nemu_toast('Copied to clipboard', {
                                theme: resolvedTheme,
                                type: 'info'
                            })
                        }}
                    >
                        <ClipboardIcon className="w-6 h-6" />
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
