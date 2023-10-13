import { MethodEnum, VerificationMethod } from "@/store/VerificationForm";

export default function ArtistAction( { method }: { method: VerificationMethod} ) {

    function determineNextStep(method: MethodEnum) {
        switch (method) {
            case MethodEnum.Twitter:
                return (
                    <h1>Twitter Chosen</h1>
                )
            case MethodEnum.Email:
                return (
                    <h1>Email Chosen</h1>
                )
            case MethodEnum.ArtistCode:
                return (
                    <h1>Artist Code Chosen</h1>
                )
        }
    }

    return (
        <div>
            {determineNextStep(method.method)}
        </div>
    )
}