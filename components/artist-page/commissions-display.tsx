'use client'

import { useState } from 'react'
import NemuImage from '../nemu-image'
import Markdown from 'react-markdown'

import { ShoppingCartIcon } from '@heroicons/react/20/solid'

import { CommissionAvailability, CommissionItem } from '@/helpers/api/request-inerfaces'

export default function CommissionsDisplay({
    commission,
    terms
}: {
    commission: CommissionItem
    terms: string
}) {
    const [currentImage, setCurrentImage] = useState(commission.featured_image)

    function convertAvailabilityToBadge(availability: CommissionAvailability) {
        switch (availability) {
            case CommissionAvailability.Closed:
                return <div className="badge badge-error badge-lg">Closed</div>
            case CommissionAvailability.Waitlist:
                return <div className="badge badge-warning badge-lg">Waitlist</div>
            case CommissionAvailability.Open:
                return <div className="badge badge-success badge-lg">Open</div>
        }
    }

    return (
        <div className="grid md:grid-cols-3 grid-cols-1 gap-5">
            <div className="bg-base-300 rounded-xl overflow-hidden">
                <NemuImage src={currentImage} alt={'Image'} width={500} height={500} />
                <div className="grid grid-cols-3 mt-5 gap-5">
                    <NemuImage
                        src={commission.featured_image}
                        alt={'Image'}
                        width={100}
                        height={100}
                        onClick={() => setCurrentImage(commission.featured_image)}
                    />
                    {commission.images?.map((image, i) => (
                        <NemuImage
                            key={i}
                            src={image}
                            alt={'image'}
                            width={100}
                            height={100}
                            onClick={() => setCurrentImage(image)}
                        />
                    ))}
                </div>
            </div>
            <div className="bg-base-300 rounded-xl col-span-2">
                <div className="card h-full">
                    <div className="card-body">
                        <h1 className="card-title font-bold text-3xl">
                            {commission.name}
                            {convertAvailabilityToBadge(commission.availability)}
                        </h1>
                        <p>{commission.description}</p>
                        <div className="card-actions justify-end">
                            <button type="button" className="btn btn-primary">
                                <ShoppingCartIcon className="w-6 h-6" />
                                Commission
                            </button>
                        </div>
                        <div className="divider">Terms &amp; Conditions</div>
                        <div className='prose'>
                            <Markdown>{`## 1. Scope of Services:
  ##### 1.1 The artist agrees to provide artistic services as described in the agreed-upon project proposal or contract.
  ##### 1.2 Any changes or additions to the scope of services must be agreed upon in writing by both parties.
  
  ## 2. Payment:
  ##### 2.1 The client agrees to pay the artist the agreed-upon fee for the services rendered.
  ##### 2.2 Payment terms, including any deposits, milestone payments, or final payments, will be outlined in the project proposal or contract.
  ##### 2.3 Late payments may be subject to additional fees or interest.
  
  ## 3. Intellectual Property:
  ##### 3.1 The artist retains all intellectual property rights to their work, unless otherwise specified in writing.
  ##### 3.2 The client is granted a non-exclusive license to use the artwork for the specific purposes outlined in the project proposal or contract.
  
  ## 4. Client Responsibilities:
  ##### 4.1 The client agrees to provide all necessary information, materials, and cooperation required for the completion of the project.
  ##### 4.2 The client is responsible for obtaining any necessary permissions or licenses for the use of third-party materials in the project.
  
  ## 5. Delivery and Deadlines:
  ##### 5.1 The artist will make reasonable efforts to deliver the completed work by the agreed-upon deadlines.
  ##### 5.2 Delays caused by unforeseen circumstances may be communicated to the client, and a revised timeline will be agreed upon.
  
  ## 6. Revisions:
  ##### 6.1 The client is entitled to a reasonable number of revisions as outlined in the project proposal or contract.
  #####6.2 Additional revisions beyond the agreed-upon limit may be subject to additional fees.
  
  ## 7. Termination:
  ##### 7.1 Either party may terminate the agreement with written notice if the other party breaches any material term of the agreement.
  ##### 7.2 In the event of termination, the client agrees to compensate the artist for any work completed up to the termination date.
  
  ## 8. Confidentiality:
  ##### 8.1 Both parties agree to keep confidential any proprietary or sensitive information disclosed during the course of the project.
  
  ## 9. Governing Law and Jurisdiction:
  ##### 9.1 This agreement shall be governed by the laws of [your jurisdiction].
  ##### 9.2 Any disputes arising out of or in connection with this agreement shall be resolved through arbitration or litigation in [your chosen venue].
  
  ## 10. Force Majeure:
  ##### 10.1 Neither party shall be liable for any delay or failure to perform its obligations due to events beyond its reasonable control, such as acts of God, war, terrorism, strikes, or natural disasters.
  
  ## 11. Miscellaneous:
  ##### 11.1 This agreement constitutes the entire understanding between the parties and supersedes all prior agreements, oral or written.
  ##### 11.2 Any amendments or modifications to this agreement must be in writing and signed by both parties.`}</Markdown>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
