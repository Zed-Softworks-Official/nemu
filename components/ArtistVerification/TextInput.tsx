'use client'

import { useState } from "react";

export default function TextInput( { labelText, htmlDataName }: { labelText?: string, htmlDataName: string }) {
    const [inputText, setInputText] = useState(labelText);

    return (
        <div className="mb-10">
            <label 
                htmlFor={htmlDataName} 
                className="block mb-5"
            >
                {labelText}
            </label>

            <input 
                type="text" 
                name={htmlDataName} 
                placeholder={inputText} 
                className="bg-white dark:bg-charcoal p-5 rounded-xl w-full" 
                onChange={(e) => setInputText(e.target.value)} 
            />
        </div>
    )
}