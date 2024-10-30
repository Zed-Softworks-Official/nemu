'use client'

export default function CommissionCreateEditForm() {
    return <></>
}

// /**
//  * Create a type from the zod schema
//  */
// type CommissionSchemaType = z.infer<typeof commissionSchema>

// /**
//  * The actual create/edit form
//  */
// export default function CommissionCreateEditForm(props: {
//     forms: InferSelectModel<typeof forms>[]
//     edit_data?: ClientCommissionItemEditable
// }) {
//     const [toastId, setToastId] = useState<string | number | undefined>()

//     const {
//         images,
//         uploadImages,
//         isUploading,
//         editData: data,
//         setEditData: setData
//     } = useUploadThingContext()

//     const mutation = api.commission.set_commission.useMutation({
//         onSuccess: (res) => {
//             if (!toastId) return

//             toast.success(`Commission ${res?.updated ? 'updated' : 'created'}!`, {
//                 id: toastId
//             })
//         },
//         onError: (e) => {
//             if (!toastId) return

//             toast.error(e.message, {
//                 id: toastId
//             })

//             // TODO: Delete the files from uploadthing
//         }
//     })

//     const form = useForm<CommissionSchemaType>({
//         resolver: zodResolver(commissionSchema),
//         mode: 'onSubmit',
//         defaultValues: props.edit_data
//             ? {
//                   title: props.edit_data.title,
//                   description: props.edit_data.description,
//                   form_id: props.edit_data.form_id,
//                   max_commissions_until_waitlist:
//                       props.edit_data.max_commissions_until_waitlist,
//                   max_commissions_until_closed:
//                       props.edit_data.max_commissions_until_closed,
//                   price: props.edit_data.price / 100,
//                   commission_availability: props.edit_data.availability
//               }
//             : undefined
//     })

//     async function ProcessForm(values: CommissionSchemaType) {
//         // Create Toast
//         const toast_id = toast.loading(
//             props.edit_data ? 'Updating Commission' : 'Uploading Files'
//         )
//         setToastId(toast_id)

//         if (!toast_id) {
//             return
//         }

//         //////////////////////////////////////////
//         // Update Commission
//         //////////////////////////////////////////
//         // If edit_data is present then that means we are editing a commission
//         if (props.edit_data) {
//             // Sort items into create, update, and delete
//             const editor_state: {
//                 create: ImageEditorData[]
//                 update: ImageEditorData[]
//                 delete: ImageEditorData[]
//             } = {
//                 create: [],
//                 update: [],
//                 delete: []
//             }

//             for (const image of images) {
//                 switch (image.data.action) {
//                     case 'create':
//                         editor_state.create.push(image)
//                         break
//                     case 'update':
//                         editor_state.update.push(image)
//                         break
//                     case 'delete':
//                         editor_state.delete.push(image)
//                         break
//                 }
//             }

//             setData(editor_state)

//             let uploaded_images: {
//                 action: 'create' | 'update' | 'delete'
//                 url: string
//                 ut_key: string
//             }[] = []

//             if (editor_state.create.length > 0) {
//                 if (
//                     editor_state.create.length +
//                         editor_state.update.length -
//                         editor_state.delete.length >
//                     6
//                 ) {
//                     const res = await uploadImages()

//                     if (!res) {
//                         toast.error('Uploading Images Failed!', {
//                             id: toast_id
//                         })

//                         return
//                     }

//                     // Add newly uploaded images to the data
//                     uploaded_images = res.map((file) => ({
//                         action: 'create',
//                         url: file.url,
//                         ut_key: file.key
//                     }))
//                 }
//             }

//             // Call the endpoint to update the database
//             mutation.mutate({
//                 type: 'update',
//                 commission_id: props.edit_data.id,
//                 data: {
//                     title: values.title,
//                     description: values.description,
//                     price: values.price,
//                     availability: values.commission_availability,
//                     form_id: values.form_id,
//                     max_commissions_until_waitlist: values.max_commissions_until_waitlist,
//                     max_commissions_until_closed: values.max_commissions_until_closed,
//                     images: uploaded_images.concat(
//                         editor_state.update.map((image) => ({
//                             action: image.data.action,
//                             url: image.data.image_data.url,
//                             ut_key: image.data.image_data.ut_key!
//                         }))
//                     ),
//                     deleted_images: data.delete.map((image) => ({
//                         action: 'delete',
//                         url: image.data.image_data.url,
//                         ut_key: image.data.image_data.ut_key!
//                     }))
//                 }
//             })

//             return
//         }

//         //////////////////////////////////////////
//         // Create Commission
//         //////////////////////////////////////////
//         // Check if we have images to upload
//         if (images.length === 0) {
//             toast.error('Images are required!', {
//                 id: toast_id
//             })

//             return
//         }

//         // Upload Images
//         const res = await uploadImages()

//         if (!res) {
//             toast.error('Uploading Images Failed!', {
//                 id: toast_id
//             })

//             return
//         }

//         // Format images response to be used in the mutation
//         const uploaded_images = res.map((file) => ({
//             url: file.url,
//             ut_key: file.key
//         }))

//         // Update Toast
//         toast.loading('Creating Commission', {
//             id: toast_id
//         })

//         // Create the new commission item
//         mutation.mutate({
//             type: 'create',
//             data: {
//                 title: values.title,
//                 description: values.description,
//                 price: values.price,
//                 availability: values.commission_availability,
//                 images: uploaded_images,
//                 form_id: values.form_id,
//                 max_commissions_until_waitlist: values.max_commissions_until_waitlist,
//                 max_commissions_until_closed: values.max_commissions_until_closed
//             }
//         })
//     }

//     return (
//         <Form {...form}>
//             <form
//                 className="mx-auto flex max-w-xl flex-col gap-5"
//                 onSubmit={form.handleSubmit(ProcessForm)}
//             >
//                 <FormField
//                     control={form.control}
//                     name="title"
//                     render={({ field }) => (
//                         <FormItem className="form-control">
//                             <FormLabel className="label">Title:</FormLabel>
//                             <Input placeholder="My Commission" {...field} />
//                             <FormMessage />
//                         </FormItem>
//                     )}
//                 />
//                 <FormField
//                     control={form.control}
//                     name="description"
//                     render={({ field }) => (
//                         <FormItem className="form-control">
//                             <FormLabel className="label">Description:</FormLabel>
//                             <Textarea
//                                 placeholder="Description"
//                                 {...field}
//                                 className="resize-none"
//                                 rows={8}
//                             />
//                             <FormMessage />
//                         </FormItem>
//                     )}
//                 />
//                 <FormField
//                     control={form.control}
//                     name="price"
//                     render={({ field }) => (
//                         <FormItem className="form-control">
//                             <FormLabel className="label">Price:</FormLabel>
//                             <div className="join w-full">
//                                 <div className="join-item flex items-center justify-center bg-base-200 px-5">
//                                     <CircleDollarSignIcon className="h-6 w-6" />
//                                 </div>
//                                 <Input
//                                     placeholder="Starting Price"
//                                     type="text"
//                                     inputMode="numeric"
//                                     className="join-item w-full"
//                                     ref={field.ref}
//                                     disabled={field.disabled}
//                                     defaultValue={field.value}
//                                     onChange={(e) => {
//                                         field.onChange(
//                                             parseFloat(e.currentTarget.value) * 100
//                                         )
//                                     }}
//                                 />
//                             </div>
//                             <FormMessage />
//                         </FormItem>
//                     )}
//                 />
//                 <div className="divider"></div>
//                 {props.forms && (
//                     <FormField
//                         control={form.control}
//                         name="form_id"
//                         render={({ field }) => (
//                             <FormItem className="form-control">
//                                 <FormLabel className="label">User Form:</FormLabel>
//                                 <Select
//                                     onValueChange={field.onChange}
//                                     defaultValue={props.edit_data?.form_id}
//                                 >
//                                     <SelectTrigger>
//                                         <SelectValue placeholder="Select User Form" />
//                                     </SelectTrigger>
//                                     <SelectContent>
//                                         {props.forms.map((form) => (
//                                             <SelectItem key={form.id} value={form.id}>
//                                                 {form.name}
//                                             </SelectItem>
//                                         ))}
//                                     </SelectContent>
//                                 </Select>
//                                 <FormMessage />
//                             </FormItem>
//                         )}
//                     />
//                 )}
//                 <FormField
//                     control={form.control}
//                     name="commission_availability"
//                     render={({ field }) => (
//                         <FormItem className="form-control">
//                             <FormLabel className="label">Availability:</FormLabel>
//                             <Select
//                                 onValueChange={field.onChange}
//                                 defaultValue={
//                                     props.edit_data
//                                         ? props.edit_data.availability
//                                         : undefined
//                                 }
//                             >
//                                 <SelectTrigger>
//                                     <SelectValue placeholder="Select Availability" />
//                                 </SelectTrigger>
//                                 <SelectContent>
//                                     <SelectItem value={CommissionAvailability.Open}>
//                                         Open
//                                     </SelectItem>
//                                     <SelectItem value={CommissionAvailability.Waitlist}>
//                                         Waitlist
//                                     </SelectItem>
//                                     <SelectItem value={CommissionAvailability.Closed}>
//                                         Closed
//                                     </SelectItem>
//                                 </SelectContent>
//                             </Select>
//                             <FormMessage />
//                         </FormItem>
//                     )}
//                 />
//                 <FormField
//                     control={form.control}
//                     name="max_commissions_until_waitlist"
//                     render={({ field }) => (
//                         <FormItem className="form-control">
//                             <FormLabel className="label">
//                                 Commissions Until Auto Waitlist:
//                             </FormLabel>
//                             <Input
//                                 placeholder="0"
//                                 type="number"
//                                 inputMode="numeric"
//                                 ref={field.ref}
//                                 defaultValue={field.value}
//                                 disabled={field.disabled}
//                                 onChange={(e) =>
//                                     field.onChange(e.currentTarget.valueAsNumber)
//                                 }
//                             />
//                             <FormMessage />
//                         </FormItem>
//                     )}
//                 />
//                 <FormField
//                     control={form.control}
//                     name="max_commissions_until_closed"
//                     render={({ field }) => (
//                         <FormItem className="form-control">
//                             <FormLabel className="label">
//                                 Commissions Until Auto Close:
//                             </FormLabel>
//                             <Input
//                                 placeholder="0"
//                                 type="number"
//                                 inputMode="numeric"
//                                 ref={field.ref}
//                                 disabled={field.disabled}
//                                 defaultValue={field.value}
//                                 onChange={(e) =>
//                                     field.onChange(e.currentTarget.valueAsNumber)
//                                 }
//                             />
//                             <FormMessage />
//                         </FormItem>
//                     )}
//                 />
//                 <div className="divider"></div>
//                 <NemuUploadThing />
//                 <div className="divider"></div>
//                 <p className="text-base-content/80">
//                     <i>
//                         Note: Commissions will need to be published. Make sure you have
//                         created the commission form for users to fill out upon a request.
//                     </i>
//                 </p>
//                 <div className="flex items-center justify-between">
//                     <Link
//                         className="btn btn-outline btn-error"
//                         href={'/dashboard/commissions'}
//                     >
//                         <XCircleIcon className="h-6 w-6" />
//                         Cancel
//                     </Link>
//                     <Button type="submit" disabled={isUploading || mutation.isPending}>
//                         <CheckCircle2Icon className="h-6 w-6" />
//                         {props.edit_data ? 'Update' : 'Create'}
//                     </Button>
//                 </div>
//             </form>
//         </Form>
//     )
// }
