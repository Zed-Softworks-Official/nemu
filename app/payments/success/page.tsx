import DefaultPageLayout from "@/app/(default)/layout";

export default function PaymentSuccess() {
    return (
        <DefaultPageLayout>
            <div className="container mx-auto text-center">
                <h1>Horray! Payment Successful</h1>
                <p>Nemu With Sparkles Goes here</p>
            </div>
        </DefaultPageLayout>
    )
}