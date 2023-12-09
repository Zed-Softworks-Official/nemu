import DefaultPageLayout from '@/app/(default)/layout'
import NemuImage from '@/components/nemu-image'
import Link from 'next/link'

export default function PaymentSuccess() {
    return (
        <DefaultPageLayout>
            <div className="flex flex-col justify-center items-center">
                <NemuImage
                    src={'/nemu/sparkles.png'}
                    alt="Nemu with sparkles in eyes"
                    width={200}
                    height={200}
                />
                <h1>You did a thing!</h1>
                <Link
                    href={'/dashboard/downloads'}
                    className="btn btn-outline btn-accent btn-lg"
                >
                    Download it here
                </Link>
            </div>
        </DefaultPageLayout>
    )
}
