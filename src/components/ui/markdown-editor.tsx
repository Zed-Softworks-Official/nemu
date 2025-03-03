'use client'

import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

export function MarkdownEditor(props: {
    disabled?: boolean
    onUpdate?: (content: JSONContent) => void
    content?: JSONContent | string | null
    placeholder?: string
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
            }),
            Placeholder.configure({
                placeholder: props.placeholder ?? 'Write something...',
                emptyEditorClass: 'is-empty'
            })
        ],
        onUpdate: ({ editor }) => {
            if (!props.onUpdate) return

            props.onUpdate(editor.getJSON())
        },
        editorProps: {
            attributes: {
                class: 'bg-input rounded-md border px-3 py-2 text-base shadow-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-full [&>h1]:text-2xl [&>h1]:font-bold [&>h2]:text-xl [&>h2]:font-bold [&>h3]:text-lg [&>h3]:font-bold [&>ul]:list-disc [&>ul]:list-outside [&>ul]:ml-4 [&>ol]:list-decimal'
            }
        }
    })

    return <EditorContent editor={editor} className="w-full" />
}
