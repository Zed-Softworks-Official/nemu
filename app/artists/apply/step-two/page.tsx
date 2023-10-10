import VertificationStep from "@/components/ArtistVerification/VerificationStep";


export default function VerificationStepTwo() {
    return (
        <VertificationStep back="/artists/apply/step-one" next="/artists/apply/step-three" >
            <h1>Step 2</h1>
        </VertificationStep>
    )
}