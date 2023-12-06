import Image, { ImageProps } from 'next/image'

export default function NemuImage({ ...props }: ImageProps) {
    return <Image {...props} draggable={false} />
}
