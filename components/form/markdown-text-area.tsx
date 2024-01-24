'use client'

import {
    BoldItalicUnderlineToggles,
    MDXEditor,
    MDXEditorMethods,
    Separator,
    UndoRedo,
    listsPlugin,
    markdownShortcutPlugin,
    thematicBreakPlugin,
    toolbarPlugin
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { InputHTMLAttributes, useState } from 'react'

interface EditorProps {
    label: string
    markdown: string
    input_name: string
    change_event: (...event: any[]) => void
    placeholder?: string
    editorRef?: React.MutableRefObject<MDXEditorMethods | null>
}

export default function MarkdownEditor({
    label,
    markdown,
    placeholder,
    editorRef,
    input_name,
    change_event
}: EditorProps) {
    return (
        <div className="form-control">
            <label className="label">{label}:</label>
            <input className="hidden" type="text" name={input_name} />
            <MDXEditor
                ref={editorRef}
                markdown={markdown}
                className="bg-base-100 rounded-xl nemu-editor"
                placeholder={placeholder}
                contentEditableClassName="!text-base-content font-nunito overflow-auto h-56 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-primary"
                plugins={[
                    markdownShortcutPlugin(),
                    listsPlugin(),
                    thematicBreakPlugin(),
                    toolbarPlugin({
                        toolbarContents: () => (
                            <>
                                <BoldItalicUnderlineToggles />
                                <Separator />
                                <UndoRedo />
                            </>
                        )
                    })
                ]}
                onChange={(value) => {
                    change_event(value)
                }}
            />
        </div>
    )
}
