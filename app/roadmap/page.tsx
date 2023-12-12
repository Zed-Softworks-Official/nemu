import { CheckCircleIcon } from '@heroicons/react/20/solid'
import DefaultPageLayout from '../(default)/layout'

export default function Roadmap() {
    return (
        <DefaultPageLayout>
            <ul className="timeline timeline-vertical">
                <li>
                    <div className="timeline-start timeline-box">Initial Launch</div>
                    <div className="timeline-middle">
                        <CheckCircleIcon className="w-5 h-5 text-primary" />
                    </div>
                    <hr className="bg-primary" />
                </li>
                <li>
                    <hr className="bg-primary" />
                    <div className="timeline-middle">
                        <CheckCircleIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="timeline-end timeline-box">iMac</div>
                    <hr className="bg-primary" />
                </li>
                <li>
                    <hr className="bg-primary" />
                    <div className="timeline-start timeline-box">iPod</div>
                    <div className="timeline-middle">
                        <CheckCircleIcon className="w-5 h-5 text-primary" />
                    </div>
                    <hr className="bg-accent" />
                </li>
                <li>
                    <hr className="bg-accent" />
                    <div className="timeline-middle">
                        <CheckCircleIcon className="w-5 h-5 text-accent" />
                    </div>
                    <div className="timeline-end timeline-box">iPhone</div>
                    <hr className="bg-accent" />
                </li>
                <li>
                    <hr className="bg-accent" />
                    <div className="timeline-start timeline-box">Apple Watch</div>
                    <div className="timeline-middle">
                        <CheckCircleIcon className="w-5 h-5 text-accent" />
                    </div>
                </li>
            </ul>
        </DefaultPageLayout>
    )
}
