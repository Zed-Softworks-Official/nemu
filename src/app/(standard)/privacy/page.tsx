export default function PrivacyPage() {
    return (
        <div className="container mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
            <h1 className="mb-4 text-3xl font-bold">Privacy Policy</h1>

            <section className="mb-6">
                <h2 className="mb-2 text-2xl font-semibold">1. Introduction</h2>
                <p>
                    Welcome to Nemu. We are committed to protecting your privacy and
                    ensuring that your personal information is handled in a safe and
                    responsible manner. This Privacy Policy outlines how we collect, use,
                    and protect your information when you use our services.
                </p>
            </section>

            <section className="mb-6">
                <h2 className="mb-2 text-2xl font-semibold">2. Information We Collect</h2>
                <p>We collect the following types of information:</p>
                <ul className="list-disc pl-5">
                    <li>
                        <strong>Account Information:</strong> When you create an account,
                        we collect your username and email address.
                    </li>
                    <li>
                        <strong>Usage Data:</strong> We collect basic usage data on how
                        you interact with our site, such as pages viewed and actions
                        taken. This data is not linked to your personal identity beyond
                        your username.
                    </li>
                </ul>
            </section>

            <section className="mb-6">
                <h2 className="mb-2 text-2xl font-semibold">3. Use of Information</h2>
                <p>We use the collected information for the following purposes:</p>
                <ul className="list-disc pl-5">
                    <li>To provide and maintain our services.</li>
                    <li>To improve and personalize your experience on our platform.</li>
                    <li>
                        To communicate with you regarding your account and our services.
                    </li>
                </ul>
            </section>

            <section className="mb-6">
                <h2 className="mb-2 text-2xl font-semibold">4. Sharing of Information</h2>
                <p>
                    We do not share your personal information with third parties except in
                    the following circumstances:
                </p>
                <ul className="list-disc pl-5">
                    <li>If required by law or in response to legal processes.</li>
                    <li>
                        To protect the rights and safety of our users and third parties.
                    </li>
                </ul>
            </section>

            <section className="mb-6">
                <h2 className="mb-2 text-2xl font-semibold">5. Data Security</h2>
                <p>
                    We implement appropriate security measures to protect your information
                    from unauthorized access, alteration, disclosure, or destruction.
                    However, please be aware that no method of internet transmission or
                    electronic storage is 100% secure.
                </p>
            </section>

            <section className="mb-6">
                <h2 className="mb-2 text-2xl font-semibold">6. Cookies</h2>
                <p>
                    We use cookies to collect and store certain information about your
                    interactions with our site. Cookies help us improve your user
                    experience by remembering your preferences and providing customized
                    content.
                </p>
            </section>

            <section className="mb-6">
                <h2 className="mb-2 text-2xl font-semibold">7. Third-Party Services</h2>
                <p>
                    We may use third-party services, such as payment processors, to
                    facilitate transactions on our platform. These third-party services
                    have their own privacy policies, and we encourage you to review them.
                </p>
            </section>

            <section className="mb-6">
                <h2 className="mb-2 text-2xl font-semibold">
                    8. Children&apos;s Privacy
                </h2>
                <p>
                    Our services are not intended for children under the age of 13. We do
                    not knowingly collect personal information from children under 13. If
                    we become aware that we have inadvertently collected such information,
                    we will take steps to delete it.
                </p>
            </section>

            <section className="mb-6">
                <h2 className="mb-2 text-2xl font-semibold">
                    9. Changes to This Privacy Policy
                </h2>
                <p>
                    We may update this Privacy Policy from time to time. Any changes will
                    be posted on this page, and we will notify you of significant changes.
                    Your continued use of our services after any changes indicates your
                    acceptance of the new policy.
                </p>
            </section>

            <section className="mb-6">
                <h2 className="mb-2 text-2xl font-semibold">10. Contact Us</h2>
                <p>
                    If you have any questions or concerns about this Privacy Policy,
                    please contact us at{' '}
                    <a href="mailto:support@zedsoftworks.com" className="link-hover link">
                        support@zedsoftworks.com
                    </a>
                    .
                </p>
            </section>
        </div>
    )
}
