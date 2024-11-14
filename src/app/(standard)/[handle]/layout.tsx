export default function ArtistLayout(props: {
    children: React.ReactNode
    modal: React.ReactNode
}) {
    return (
        <>
            {props.children}
            {props.modal}
        </>
    )
}
