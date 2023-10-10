import VertificationStep from "@/components/ArtistVerification/VerificationStep";

export default function VerificationStepThree() {
    return (
        <VertificationStep back="/artists/apply/step-two" next="/artists/apply/step-three" >
            <h1>Step 3</h1>
        </VertificationStep>
    )
}