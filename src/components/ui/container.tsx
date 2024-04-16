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



export default function Container({
    variant,
    figure,
    children
}: {
    variant: VariantProps<typeof containerVariants>
    figure?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className={cn(containerVariants(variant))}>
            <figure>{figure}</figure>
            <div className="card-body">{children}</div>
        </div>
    )
}
