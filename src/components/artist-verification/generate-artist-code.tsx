'use client'

import { ClipboardIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '~/trpc/react'

export default function GenerateAristCode() {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)
    const [generatedCode, setGeneratedCode] = useState(crypto.randomUUID())
    const [generating, setGenerating] = useState(false)

    const mutation = api.verification.set_artist_code.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Generating Artist Code'))
        },
        onSuccess(res) {
            if (!toastId) return

            setGenerating(false)
            setGeneratedCode(res.generated_code)

            toast.success('Artist Code Generated!', {
                id: toastId
            })
        },
        onError(e) {
            if (!toastId) return

            setGenerating(false)
            toast.error(e.message, {
                id: toastId
            })
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
                        className="input join-item w-full"
                    />
                    <button
                        className="btn"
                        onMouseDown={async () => {
                            await navigator.clipboard.writeText(generatedCode)
                            toast.success('Copied to clipboard')
                        }}
                    >
                        <ClipboardIcon className="h-6 w-6" />
                        Copy
                    </button>
                </div>
                <button
                    className="btn btn-primary btn-wide"
                    onMouseDown={() => {
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
