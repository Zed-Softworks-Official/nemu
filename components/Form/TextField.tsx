'use client'

import type { ForwardedRef } from 'react'
import {
    BoldItalicUnderlineToggles,
    MDXEditor,
    MDXEditorMethods,
    MDXEditorProps,
    UndoRedo,
    headingsPlugin,
    markdownShortcutPlugin,
    toolbarPlugin
} from '@mdxeditor/editor'

export default function TextField({
    label,
    editorRef,
    ...props
}: {
    label: string
    editorRef?: ForwardedRef<MDXEditorMethods> | null
} & MDXEditorProps) {
    return (
        <div className="mb-5">
            <label className="inline-block mb-5">{label}:</label>
            <MDXEditor
                plugins={[
                    headingsPlugin(),
                    markdownShortcutPlugin(),
                    toolbarPlugin({
                        toolbarContents: () => (
                            <>
                                <BoldItalicUnderlineToggles />
                                <UndoRedo />
                            </>
                        )
                    })
                ]}
                {...props}
                ref={editorRef}
                className="bg-charcoal p-5 rounded-xl"
            />
        </div>
    )
}
