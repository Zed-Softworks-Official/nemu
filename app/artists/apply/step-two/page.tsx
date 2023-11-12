import VerificationOption from '@/components/ArtistVerification/steps/verification-option'
import VertificationStep from '@/components/ArtistVerification/layout/verification-step'

export default function VerificationStepTwo() {
    return (
        <VertificationStep
            back="/artists/apply/step-one"
            next="/artists/apply/step-three"
        >
            <VerificationOption />
        </VertificationStep>
    )
}
