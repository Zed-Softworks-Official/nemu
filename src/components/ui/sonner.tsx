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
                    toast: 'group toast group-[.toaster]:bg-base-300 group-[.toaster]:text-base-content group-[.toaster]:border-base-200 group-[.toaster]:shadow-lg',
                    description: 'group-[.toast]:text-base-content/80',
                    actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-white',
                    cancelButton:
                        'group-[.toast]:bg-error group-[.toast]:text-base-content'
                }
            }}
            {...props}
        />
    )
}

export { Toaster }
