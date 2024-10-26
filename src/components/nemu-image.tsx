'use client'

import Image, { type ImageProps } from 'next/image'

export default function NemuImage({ ...props }: ImageProps) {
    return (
        // eslint-disable-next-line jsx-a11y/alt-text
        (<Image
            {...props}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            // className="pointer-events-none"
        />)
    );
}
