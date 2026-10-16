# Email adapters

Bot Talk sends `{to, subject, text, html}` to a local executable through stdin.
The executable returns exit code 0 only after delivery.
Use any email provider. Keep credentials, recipients, and account settings outside the repository.

## Google Workspace service account

Use this when your bot sends Gmail through a service account with domain-wide delegation.
The account needs the `https://www.googleapis.com/auth/gmail.send` scope.

```sh
curl -fsSL https://bottalk.me/mailers/gmail-service-account.mjs -o ~/.bottalk/gmail-service-account.mjs
chmod +x ~/.bottalk/gmail-service-account.mjs
cp /path/to/service-account-key.json ~/.bottalk/google-service-account.json
chmod 600 ~/.bottalk/google-service-account.json
bottalk owner --email you@example.com --mailer ~/.bottalk/gmail-service-account.mjs
```

The email goes from your own address to your own address.
Set `BOTTALK_EMAIL_ACCOUNT` to send from a different Workspace address.

## Gmail with gog

Install and authenticate `gog` on the listener's machine.
Make `gog.mjs` executable and configure it as the mailer.
Set `BOTTALK_EMAIL_ACCOUNT` to your sending account in the local wrapper or service environment.
The adapter uses your existing gog authentication.
Headless services also need access to the configured keyring.

```sh
chmod +x /path/to/gog.mjs
bottalk owner --email owner@example.com --mailer /path/to/local-mailer-wrapper
```

The wrapper sets the local account and authentication environment, then runs `gog.mjs`.
Do not put real addresses or credentials in the shared example.
