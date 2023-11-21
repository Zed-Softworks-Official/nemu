import VerificationOption from '@/components/artist-verification/steps/verification-option'
import VertificationStep from '@/components/artist-verification/layout/verification-step'

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
