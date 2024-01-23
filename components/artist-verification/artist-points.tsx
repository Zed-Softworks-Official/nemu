'use client'

import { useState, Fragment } from "react";
import { RadioGroup, Transition } from "@headlessui/react";
import { useTimeoutFn } from "react-use";

const points = [
    {
        name: '95/5 Revenue Split',
        blurb: 'Blurb',
        desc: 'description 1'
    },
    {
        name: 'Streamlined Workflow',
        blurb: 'Built in Kanban, Client Messaging, and SOMETHING',
        desc: 'description 2'
    },
    {
        name: 'Commission Queues',
        blurb: 'Something Cool',
        desc: 'description 3'
    }
]

export default function ArtistPoints() {
    const [selected, setSelected] = useState(points[0]);
    const [isShowing, setIsShowing] = useState(true);
    const [currentDesc, setCurrentDesc] = useState(points[0].desc);

    const [, , resetIsShowing] = useTimeoutFn(() => {setIsShowing(true); setCurrentDesc(selected.desc); }, 500);
    
    return (
        <div className="grid grid-cols-3 grid-flow-cols gap-10 my-10 max-w-6xl mx-auto">
            <RadioGroup value={selected} onChange={setSelected} onClick={() => { setIsShowing(false); resetIsShowing();}}>
                <RadioGroup.Label className='sr-only'>Verification Method</RadioGroup.Label>
                <div className='space-y-2'>
                    { points.map( (point) => (
                        <RadioGroup.Option
                            key={point.name}
                            value={point}
                            className={ ({active, checked}) => 
                                `${
                                    active
                                    ? 'ring-2 ring-white ring-opacity-60 ring-offset-2 ring-offset-primary'
                                    : ''
                                }
                                ${
                                    checked ? 'bg-primary bg-opacity-75 text-white' : 'bg-charcoal'
                                }
                                relative flex cursor-pointer rounded-xl px-5 py-4 shadown-md focus:outline-none`
                            }
                        >
                            {({ active, checked }) => (
                                <>
                                    <div className='flex w-full justify-center'>
                                        <div className='flex flex-col items-center'>
                                            <RadioGroup.Label as='p' className={`font-medium my-5 text-white`}>
                                                {point.name}
                                            </RadioGroup.Label>
                                            <RadioGroup.Description as='p' className={`mb-5 text-white/40`}>
                                                {point.blurb}
                                            </RadioGroup.Description>
                                        </div>
                                    </div>
                                </>
                            )}
                        </RadioGroup.Option>
                    ))}
                </div>
            </RadioGroup>
            
            <Transition 
                as={Fragment}
                show={isShowing}
                enter="transform transition duration-[400ms]"
                enterFrom="opacity-0 scale-50"
                enterTo="opacity-100 scale-100"
                leave="transform duration-200 transition ease-in-out"
                leaveFrom="opacity-100 scale-100 "
                leaveTo="opacity-0 scale-95 "
            >
                <div className="bg-charcoal col-span-2 p-10 rounded-xl text-left text-lg">
                    {currentDesc}
                </div>
            </Transition>
        </div>
    )
}