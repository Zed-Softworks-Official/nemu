'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme()

    return (
        <Sonner
            theme={theme as ToasterProps['theme']}
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast: 'group toast group-[.toaster]:bg-[#161616] group-[.toaster]:text-base-content group-[.toaster]:border-border group-[.toaster]:shadow-xl',
                    description: 'group-[.toast]:text-base-content/80',
                    actionButton:
                        'group-[.toast]:bg-primary group-[.toast]:text-base-content',
                    cancelButton:
                        'group-[.toast]:bg-muted group-[.toast]:text-base-content/80'
                }
            }}
            {...props}
        />
    )
}

export { Toaster }
