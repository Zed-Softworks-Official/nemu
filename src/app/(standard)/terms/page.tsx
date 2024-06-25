import Link from 'next/link'

export default function TermsPage() {
    return (
        <div className="container mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
            <div className="space-y-6">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    Terms of Service
                </h1>
                <div>
                    <p className="italic text-base-content/60">Zed Softworks LLC</p>
                    <p className="text-base-content/60">Last updated: June 24, 2024</p>
                </div>

                <div className="space-y-4">
                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">
                            1. Acceptance of Terms
                        </h2>
                        <p>
                            By using our services, you agree to comply with and be legally
                            bound by these Terms and any applicable laws and regulations.
                            If you do not agree to these Terms, you may not use our
                            services.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">
                            2. Services Provided
                        </h2>
                        <ul className="list-disc pl-5">
                            <li>Upload and sell art.</li>
                            <li>Receive commissions to create custom artwork.</li>
                            <li>Link social media accounts to their profile.</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">
                            3. Account Registration
                        </h2>
                        <p>
                            To use our services, you must create an account. When
                            registering, you agree to:
                        </p>
                        <ul className="list-disc pl-5">
                            <li>Provide accurate and complete information.</li>
                            <li>Keep your login credentials confidential.</li>
                            <li>
                                Notify us immediately of any unauthorized use of your
                                account.
                            </li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">
                            4. Payments and Fees
                        </h2>
                        <p>
                            We use Stripe as our payment processor. By using our services,
                            you agree to Stripe&apos;s terms and conditions.
                        </p>
                        <ul className="list-disc pl-5">
                            <li>A 5% platform fee is applied to all transactions.</li>
                            <li>
                                You can remove the platform fee by subscribing as a
                                &quot;Supporter&quot; for $6/month or $57.60/year.
                            </li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">5. Subscription</h2>
                        <p>&quot;Supporter&quot; subscription:</p>
                        <ul className="list-disc pl-5">
                            <li>Monthly: $6.00</li>
                            <li>Yearly: $57.60</li>
                        </ul>
                        <p>
                            By subscribing, you authorize us to charge your payment method
                            on a recurring basis.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">6. User Content</h2>
                        <p>
                            By uploading art or content, you grant us a non-exclusive,
                            worldwide, royalty-free license to use, display, and
                            distribute your content on our platform.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">
                            7. Linking Social Media Accounts
                        </h2>
                        <p>
                            Artists may link their social media accounts to their
                            profiles. By doing so, you consent to the display of your
                            social media information on our platform.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">
                            8. Data Collection and Privacy
                        </h2>
                        <ul className="list-disc pl-5">
                            <li>We do not collect personal data.</li>
                            <li>
                                We collect basic usage data for account holders, which is
                                not linked to your individual identity beyond your
                                username.
                            </li>
                            <li>For more details, please review our Privacy Policy.</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">9. User Conduct</h2>
                        <p>You agree not to:</p>
                        <ul className="list-disc pl-5">
                            <li>Violate any laws or regulations.</li>
                            <li>Post any illegal, harmful, or offensive content.</li>
                            <li>Infringe on the rights of others.</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">
                            10. Copyright and Intellectual Property
                        </h2>
                        <h3 className="mb-2 text-xl font-semibold">
                            10.1 User Content and Copyright
                        </h3>
                        <p>
                            By uploading content to Nemu, you affirm that you own the
                            rights to the content or have obtained all necessary
                            permissions to upload and share it. You retain all rights to
                            your content.
                        </p>
                        <h3 className="mb-2 text-xl font-semibold">
                            10.2 Copyright Infringement
                        </h3>
                        <p>
                            Nemu respects the intellectual property rights of others. We
                            respond to notices of alleged copyright infringement in
                            accordance with the Digital Millennium Copyright Act (DMCA).
                        </p>
                        <h3 className="mb-2 text-xl font-semibold">
                            10.3 DMCA Notice and Takedown Procedure
                        </h3>
                        <p>
                            If you believe that your copyrighted work has been copied in a
                            way that constitutes copyright infringement, please provide
                            our designated agent with the following information:
                        </p>
                        <ul className="list-disc pl-5">
                            <li>
                                A physical or electronic signature of the copyright owner
                                or a person authorized to act on their behalf.
                            </li>
                            <li>
                                Identification of the copyrighted work claimed to have
                                been infringed.
                            </li>
                            <li>
                                Identification of the material that is claimed to be
                                infringing and where it is located on the site.
                            </li>
                            <li>
                                Your contact information, including address, telephone
                                number, and email address.
                            </li>
                            <li>
                                A statement that you have a good faith belief that the
                                disputed use is not authorized by the copyright owner, its
                                agent, or the law.
                            </li>
                            <li>
                                A statement that the information in the notification is
                                accurate and, under penalty of perjury, that you are
                                authorized to act on behalf of the copyright owner.
                            </li>
                        </ul>
                        <p>
                            Our designated agent for notice of claims of copyright
                            infringement can be reached at:{' '}
                            <Link
                                href="mailto:kevin.zoltany@zedsoftworks.com"
                                className="link-hover link"
                            >
                                kevin.zoltany@zedsoftworks.com
                            </Link>
                            .
                        </p>
                        <h3 className="mb-2 text-xl font-semibold">
                            10.4 Repeat Infringer Policy
                        </h3>
                        <p>
                            Nemu reserves the right to terminate user accounts that are
                            subject to repeated DMCA or other infringement notifications.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">11. Termination</h2>
                        <p>
                            We reserve the right to suspend or terminate your account if
                            you violate these Terms or engage in any activity that we deem
                            harmful to the platform or other users.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">
                            12. Limitation of Liability
                        </h2>
                        <p>
                            To the fullest extent permitted by law, we are not liable for
                            any indirect, incidental, or consequential damages arising out
                            of your use of our services.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">13. Governing Law</h2>
                        <p>
                            These Terms are governed by the laws of the United States,
                            without regard to its conflict of law principles.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">
                            14. Changes to Terms
                        </h2>
                        <p>
                            We may modify these Terms at any time. Any changes will be
                            posted on our website, and your continued use of our services
                            constitutes acceptance of the new Terms.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="mb-2 text-2xl font-semibold">15. Contact Us</h2>
                        <p>
                            If you have any questions about these Terms, please contact us
                            at{' '}
                            <Link
                                href="mailto:kevin.zoltany@zedsoftworks.com"
                                className="link-hover link"
                            >
                                kevin.zoltany@zedsoftworks.com
                            </Link>
                            .
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
