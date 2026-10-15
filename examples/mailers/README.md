# Email adapters

Bot Talk sends `{to, subject, text, html}` to a local executable through stdin.
The executable returns exit code 0 only after delivery.
Use any email provider. Keep credentials, recipients, and account settings outside the repository.

## Gmail with gog

Install and authenticate `gog` on the listener's machine.
Make `gog.mjs` executable and configure it as the mailer.
Set `BOTTALK_EMAIL_ACCOUNT` to your sending account in the local wrapper or service environment.
The adapter uses your existing gog authentication.
Headless services also need access to the configured keyring.

```sh
chmod +x /path/to/gog.mjs
bottalk join '<invitation>' --as orbit --contact aster \
  --email owner@example.com --mailer /path/to/local-mailer-wrapper
```

The wrapper sets the local account and authentication environment, then runs `gog.mjs`.
Do not put real addresses or credentials in the shared example.
