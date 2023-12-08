'use client'

export default function DownloadsList() {
    return (
        <div className="overflow-x-auto w-full rounded-xl">
            <table className="table table-zebra">
                <thead className=" bg-base-200">
                    <th>Item Name</th>
                    <th>Artist</th>
                    <th>Price</th>
                    <th>Download</th>
                </thead>
                <tbody>
                    <tr>
                        <td>Test Item</td>
                        <td>JackSchitt404</td>
                        <td>$20.00</td>
                        <td>
                            <button type="button" className="btn btn-primary">
                                Download
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    )
}
