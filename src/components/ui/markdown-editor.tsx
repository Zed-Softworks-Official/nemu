'use client'

import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

export function MarkdownEditor(props: {
    disabled?: boolean
    onUpdate: (content: JSONContent) => void
    content?: JSONContent | string | null
}) {
    const parseContent = () => {
        if (!props.content) return undefined

        if (typeof props.content === 'string') {
            try {
                return JSON.parse(props.content) as JSONContent
            } catch (e) {
                console.error('Failed to parse content string:', e)
                return undefined
            }
        }

        return props.content // Already a JSONContent object
    }

    const editor = useEditor({
        content: parseContent(),
        editable: !props.disabled,
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3]
                }
            })
        ],
        onUpdate: ({ editor }) => {
            props.onUpdate(editor.getJSON())
        },
        editorProps: {
            attributes: {
                class: 'bg-input rounded-md border px-3 py-2 text-base shadow-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-full [&>h1]:text-2xl [&>h1]:font-bold [&>h2]:text-xl [&>h2]:font-bold [&>h3]:text-lg [&>h3]:font-bold'
            }
        }
    })

    return <EditorContent editor={editor} />
}
