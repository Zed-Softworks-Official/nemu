import DefaultPageLayout from '@/app/(default)/layout'
import NemuImage from '@/components/nemu-image'
import Link from 'next/link'

export default function CommissionPaymentsSuccessPage() {
    return (
        <DefaultPageLayout>
            <div className="card bg-base-300">
                <div className="card-body">
                    <div className="flex flex-col w-full justify-center items-center max-w-xl mx-auto">
                        <NemuImage src={'/nemu/sparkles.png'} alt="Nemu with sparkles in eyes" width={200} height={200} />
                        <div className="prose pt-10 text-center">
                            <h1>You did a thing!</h1>
                            <p>
                                Your commission will be reviewed by the artist once they're available. Please note, you won't be charged until the
                                artist accepts your commission.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </DefaultPageLayout>
    )
}
