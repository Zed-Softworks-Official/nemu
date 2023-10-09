'use client'

import MultiStep from 'react-multistep';

import VerificationStepOne from './Steps/StepOne';
import VerificationStepTwo from './Steps/StepTwo';

export default function VerificationForm() {
    return (
        <MultiStep activeStep={0}>
            <VerificationStepOne title="Basic Information" />
            <VerificationStepTwo title="Something Else" />
        </MultiStep>
    )
}