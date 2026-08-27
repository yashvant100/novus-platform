"""
Novus V2 - SMTP email sender.

IMPORTANT:
This sender intentionally sends the notification as text/html directly.
We are not adding a text/plain alternative because the requirement is to
force Outlook/webmail to render the Novus HTML notification.
"""

import html
import re
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

from app.core.crypto import decrypt_secret
from app.models import EmailProvider


def _fallback_html(body: str) -> str:
    """Create a safe HTML document if notifications passes no html_body."""

    escaped = html.escape(body or "")

    # Make URLs clickable.
    escaped = re.sub(
        r"(https?://[^\s<]+)",
        r'<a href="\1" style="color:#2563eb;text-decoration:underline;">\1</a>',
        escaped,
    )

    escaped = escaped.replace("\n", "<br>\n")

    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Novus Loyalty</title>
</head>
<body style="margin:0;padding:28px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center">
<table width="700" cellpadding="0" cellspacing="0" border="0"
       style="width:100%;max-width:700px;background:#ffffff;border:1px solid #dbe3ec;border-radius:14px;overflow:hidden;">
<tr>
<td style="padding:24px 28px;background:#0f172a;color:#ffffff;">
<div style="font-size:24px;font-weight:700;">Novus <span style="color:#22d3ee;">Loyalty</span></div>
<div style="margin-top:4px;font-size:12px;letter-spacing:2px;color:#cbd5e1;">URL MONITOR</div>
</td>
</tr>
<tr>
<td style="height:4px;background:#06b6d4;font-size:0;line-height:0;">&nbsp;</td>
</tr>
<tr>
<td style="padding:28px;font-size:14px;line-height:1.65;">
{escaped}
</td>
</tr>
<tr>
<td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;">
Automated notification from Novus Loyalty URL Monitor.
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>"""


def send_smtp(
    provider: EmailProvider,
    recipients: list[str],
    subject: str,
    body: str,
    html_body: Optional[str] = None,
) -> None:

    if not provider.host:
        raise ValueError("SMTP provider host is missing")

    if not provider.port:
        raise ValueError("SMTP provider port is missing")

    if not provider.from_email:
        raise ValueError("SMTP from email is missing")

    if not recipients:
        raise ValueError("No email recipients configured")

    # ----------------------------------------------------------
    # FORCE HTML
    # ----------------------------------------------------------
    #
    # notifications.py already creates html_body using
    # build_email_html(). Use that exact HTML.
    #
    # We intentionally DO NOT call:
    #     message.set_content(body)
    #
    # because that creates a text/plain message.
    #
    # Instead, set the EmailMessage itself to text/html.
    # ----------------------------------------------------------

    final_html = (html_body or "").strip()

    if not final_html:
        final_html = _fallback_html(body)

    message = EmailMessage()

    message["Subject"] = subject

    if provider.from_name:
        message["From"] = (
            f"{provider.from_name} <{provider.from_email}>"
        )
    else:
        message["From"] = provider.from_email

    message["To"] = ", ".join(recipients)

    # FORCE Content-Type: text/html
    message.set_content(
        final_html,
        subtype="html",
        charset="utf-8",
    )

    # ----------------------------------------------------------
    # SMTP PASSWORD
    # ----------------------------------------------------------

    password = ""

    if provider.encrypted_secret:
        password = decrypt_secret(
            provider.encrypted_secret
        )

    # ----------------------------------------------------------
    # SMTP SSL - 465
    # ----------------------------------------------------------

    if provider.port == 465:

        context = ssl.create_default_context()

        with smtplib.SMTP_SSL(
            provider.host,
            provider.port,
            timeout=30,
            context=context,
        ) as smtp:

            smtp.ehlo()

            if provider.username:
                smtp.login(
                    provider.username,
                    password,
                )

            smtp.send_message(
                message
            )

        return

    # ----------------------------------------------------------
    # SMTP / STARTTLS - 587
    # ----------------------------------------------------------

    with smtplib.SMTP(
        provider.host,
        provider.port,
        timeout=30,
    ) as smtp:

        smtp.ehlo()

        if provider.tls_enabled:

            context = ssl.create_default_context()

            smtp.starttls(
                context=context,
            )

            smtp.ehlo()

        if provider.username:
            smtp.login(
                provider.username,
                password,
            )

        smtp.send_message(
            message
        )
