import { MethodEnum, VerificationMethod } from "@/store/VerificationForm";
import TwitterVerificationMethod from "./Methods/TwitterVerificationMethod";
import EmailVerificationMethod from "./Methods/EmailVerificationMethod";
import ArtistCodeVerificiationMethod from "./Methods/ArtistCodeVerificationMethod";

export default function ArtistAction( { method }: { method: VerificationMethod} ) {

    function determineNextStep(method: MethodEnum) {
        switch (method) {
            case MethodEnum.Twitter:
                return (
                    <TwitterVerificationMethod />
                )
            case MethodEnum.Email:
                return (
                    <EmailVerificationMethod />
                )
            case MethodEnum.ArtistCode:
                return (
                    <ArtistCodeVerificiationMethod />
                )
        }
    }

    return (
        <>
            {determineNextStep(method.method)}
        </>
    )
}