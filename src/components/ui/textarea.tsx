import * as React from 'react'

import { cn } from '~/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return <textarea className={cn('textarea', className)} ref={ref} {...props} />
    }
)
Textarea.displayName = 'Textarea'

export { Textarea }
