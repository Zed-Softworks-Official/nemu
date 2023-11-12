import { MethodEnum, VerificationMethod } from '@/store/VerificationForm'
import TwitterVerificationMethod from './methods/twitter-verification-method'
import EmailVerificationMethod from './methods/email-verification-method'
import ArtistCodeVerificiationMethod from './methods/artist-code-verification-method'

export default function ArtistAction({ method }: { method: VerificationMethod }) {
    function determineNextStep(method: MethodEnum) {
        switch (method) {
            case MethodEnum.Twitter:
                return <TwitterVerificationMethod />
            case MethodEnum.Email:
                return <EmailVerificationMethod />
            case MethodEnum.ArtistCode:
                return <ArtistCodeVerificiationMethod />
        }
    }

    return <>{determineNextStep(method.method)}</>
}
