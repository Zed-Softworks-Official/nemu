import { EyeIcon, EyeSlashIcon } from '@heroicons/react/20/solid'

export default function PreviewButton() {
    return (
        <label className="btn btn-outline btn-accent swap">
            <input type="checkbox" />
            <EyeSlashIcon className="w-6 h-6 swap-on fill-current" />
            <EyeIcon className="w-6 h-6 swap-off fill-current" />
        </label>
        
    )
}
