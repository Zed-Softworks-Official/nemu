import DefaultPageLayout from './(default)/layout'
import { Metadata } from 'next'
import NemuImage from '@/components/nemu-image'

export const metadata: Metadata = {
    title: 'Nemu | Oh Nyo!'
}

export default function NotFound() {
    return (
        <DefaultPageLayout>
            <div className="flex flex-col justify-center items-center text-center h-full">
                <div>
                    <NemuImage
                        src={'/nemu/this-is-fine.png'}
                        alt="This is fine"
                        width={300}
                        height={300}
                    />
                </div>
                <div>
                    <h1>Error 404</h1>
                    <p>Oh Nyo! We couldn&apos;t find that</p>
                </div>
            </div>
        </DefaultPageLayout>
    )
}
