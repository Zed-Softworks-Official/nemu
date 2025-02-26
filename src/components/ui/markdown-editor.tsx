'use client'

import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

export function MarkdownEditor(props: {
    disabled?: boolean
    onUpdate: (content: string) => void
    content?: JSONContent | null
}) {
    const editor = useEditor({
        content: props.content ?? undefined,
        editable: !props.disabled,
        extensions: [StarterKit],
        onUpdate: ({ editor }) => {
            props.onUpdate(JSON.stringify(editor.getJSON()))
        }
    })

    return (
        <EditorContent
            editor={editor}
            className="[&_div]:border-input [&_div]:bg-input [&_div]:placeholder:text-muted-foreground [&_div]:focus-visible:ring-ring [&_div]:rounded-md [&_div]:border [&_div]:px-3 [&_div]:py-2 [&_div]:text-base [&_div]:shadow-xs [&_div]:focus-visible:ring-1 [&_div]:focus-visible:outline-hidden [&_div]:disabled:cursor-not-allowed [&_div]:disabled:opacity-50 [&_div]:md:text-sm [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-bold [&_h4]:text-base [&_h4]:font-bold [&_h5]:text-sm [&_h5]:font-bold [&_h6]:text-xs [&_h6]:font-bold"
        />
    )
}
