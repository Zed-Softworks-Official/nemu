import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/utils'

const containerVariants = cva('card shadow-xl', {
    variants: {
        variant: {
            default: 'bg-base-300',
            muted: 'bg-base-200',
            light: 'bg-base-100'
        }
    },
    defaultVariants: {
        variant: 'default'
    }
})

export interface ContainerProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof containerVariants> {
    figure?: React.ReactNode
    className?: string
    children: React.ReactNode
}

export default function Container({
    variant,
    figure,
    className,
    children,
    ...props
}: ContainerProps) {
    return (
        <div className={cn(containerVariants({ variant }), className)}>
            <figure>{figure}</figure>
            <div className="card-body">{children}</div>
        </div>
    )
}
