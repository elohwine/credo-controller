import type { Express } from 'express'

const privacyPolicyHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy | IdenEx Credentis</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#f4f8fb;color:#12324a;line-height:1.65}
main{max-width:800px;margin:auto;padding:32px 20px;background:#fff}
h1,h2{line-height:1.3}a{color:#075985}footer{border-top:1px solid #ddd;margin-top:32px;padding-top:16px}
</style>
</head>
<body><main>
<h1>IdenEx Credentis Privacy Policy</h1>
<p>Effective date: 22 October 2026</p>
<p>IdenEx Credentis operates the Credentis application and related services for
digital wallets, verifiable credentials, organisation workflows and commerce.
This policy explains how we process personal information when you use these services.</p>

<h2>Information we process</h2>
<ul>
<li>Account and contact information, such as your phone number, name, email address
when supplied, account identifiers and authentication records.</li>
<li>Wallet and credential information, such as credential claims, issuer and holder
identifiers, credential offers, verification requests and consent decisions.</li>
<li>Organisation information, such as memberships, employee records, invitations,
assigned workflow steps and the records you submit or receive.</li>
<li>Commerce and payment records, such as invoices, receipts, payment references
and payment status returned by connected payment providers.</li>
<li>Operational information, such as request logs, device registrations, notification
preferences, delivery identifiers, delivery status and security events.</li>
</ul>
<p>The information processed depends on the features you use and what you or your
organisation provide. Organisations may supply your details when inviting you or
issuing a credential.</p>

<h2>Why we use information</h2>
<p>We use information to create and authenticate accounts, deliver wallet records,
issue and verify credentials, operate authorised organisation workflows, process
commerce notifications, respect your notification choices, provide support and
protect the service against misuse. We also retain records needed to investigate
errors, resolve disputes and meet applicable legal obligations.</p>

<h2>Optional WhatsApp notifications</h2>
<p>WhatsApp alerts are optional and require a recorded opt-in for the relevant
notification type. When enabled, we send your phone number and a short account-update
message with an inbox link to Meta's WhatsApp Business Platform. We do not include
credential contents, authentication tokens or contact-claim tokens in these alerts.
We process delivery status and inbound opt-out messages to operate this feature.</p>
<p>You can change your choices in Settings &rarr; WhatsApp alerts or reply
<strong>STOP</strong>, <strong>UNSUBSCRIBE</strong> or <strong>CANCEL</strong> to the
sending number. A STOP to the shared Credentis number withdraws alerts using that
number, including your personal "any organisation" choices. Turning off WhatsApp
does not delete your account or stop records appearing inside your wallet.</p>
<p>Meta processes information under its own
<a href="https://www.whatsapp.com/legal/privacy-policy">WhatsApp Privacy Policy</a>.</p>

<h2>When information is shared</h2>
<p>Information is made available to the organisations and participants involved in
the workflow, issuance or verification you use, subject to the service's access
controls. An organisation that issues or requests records may also process that
information under its own policies.</p>
<p>We use infrastructure and delivery providers, including Fly.io for hosting,
Meta for WhatsApp, and configured payment, email or SMS providers when those
features are used. These providers receive information needed for their role.
Information may also be disclosed where required by law or necessary to protect
users and the service. Service providers may process information in countries
other than your own.</p>

<h2>Storage, security and retention</h2>
<p>We use authentication, access controls and encrypted network connections to
protect information. No service can guarantee absolute security. Access to your
device, wallet and sign-in credentials should be protected.</p>
<p>We retain information for as long as needed to operate the service and for
security, dispute resolution and applicable legal requirements. Retention depends
on the record and the organisation involved. Backups may retain copies until
their normal retention cycle ends. Credentials already shared with other parties
and records retained independently by an issuer or recipient cannot necessarily
be recalled or deleted by Credentis.</p>

<h2>Your choices and deletion requests</h2>
<p>You may contact us to request access to, correction of, or deletion of your
personal information or account, and to raise questions about its use. Email
<a href="mailto:elowine@outlook.com">elowine@outlook.com</a> with the subject
"Privacy request" or "Account deletion". Identify the account concerned, but do
not send passwords, PINs, access tokens or private keys. We may need to verify
your identity before acting.</p>
<p>We will explain any records we need to retain and the reason. Requests involving
records controlled by an organisation may also need to be addressed to that
organisation. Your rights depend on applicable law.</p>

<h2>Local storage</h2>
<p>The application uses local storage on your device to maintain sign-in state,
account context and preferences. Signing out or clearing application data removes
local state but does not itself delete server records.</p>

<h2>Changes and contact</h2>
<p>We may update this policy as the service changes. The effective date above
identifies the current version. For privacy questions, contact
<strong>IdenEx Credentis</strong> at
<a href="mailto:elowine@outlook.com">elowine@outlook.com</a>.</p>
<footer>IdenEx Credentis &middot; Privacy Policy</footer>
</main></body></html>`

export function registerPrivacyPolicy(app: Express): void {
  app.get(['/privacy-policy', '/privacy'], (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.type('html').send(privacyPolicyHtml)
  })
}
