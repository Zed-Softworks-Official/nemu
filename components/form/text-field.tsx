'use client'

import { useState, type ForwardedRef } from 'react'
import {
    BoldItalicUnderlineToggles,
    MDXEditor,
    MDXEditorMethods,
    MDXEditorProps,
    UndoRedo,
    listsPlugin,
    markdownShortcutPlugin,
    thematicBreakPlugin,
    toolbarPlugin
} from '@mdxeditor/editor'

export default function TextField({
    label,
    name,
    editorRef,
    ...props
}: {
    label: string
    name: string
    editorRef?: ForwardedRef<MDXEditorMethods> | null
} & MDXEditorProps) {
    const [markdownContent, setMarkdownContent] = useState('')

    return (
        <div className="mb-5">
            <label className="inline-block mb-5">{label}:</label>
            <input type="hidden" name={name} value={markdownContent} />
            <MDXEditor
                plugins={[
                    markdownShortcutPlugin(),
                    listsPlugin(),
                    thematicBreakPlugin(),
                    toolbarPlugin({
                        toolbarContents: () => (
                            <>
                                <BoldItalicUnderlineToggles />
                                <UndoRedo />
                            </>
                        )
                    })
                ]}
                onChange={setMarkdownContent}
                {...props}
                ref={editorRef}
                className="bg-charcoal p-5 rounded-xl"
            />
        </div>
    )
}
