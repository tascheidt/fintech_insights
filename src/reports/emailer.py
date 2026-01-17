"""Email delivery for reports."""

import smtplib
import ssl
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class EmailDelivery:
    """Send reports via SMTP email."""

    def __init__(
        self,
        smtp_host: Optional[str] = None,
        smtp_port: Optional[int] = None,
        smtp_user: Optional[str] = None,
        smtp_password: Optional[str] = None,
        from_address: Optional[str] = None
    ):
        """Initialize email delivery with SMTP settings.

        Settings can be passed directly or loaded from environment variables.
        """
        self.smtp_host = smtp_host or os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = smtp_port or int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = smtp_user or os.getenv("SMTP_USER", "")
        self.smtp_password = smtp_password or os.getenv("SMTP_PASSWORD", "")
        self.from_address = from_address or os.getenv("EMAIL_FROM", self.smtp_user)

    def is_configured(self) -> bool:
        """Check if email delivery is properly configured."""
        return bool(self.smtp_user and self.smtp_password and self.from_address)

    def send_report(
        self,
        recipients: List[str],
        subject: str,
        html_content: str,
        plain_text: Optional[str] = None
    ) -> bool:
        """Send an HTML report email.

        Args:
            recipients: List of email addresses
            subject: Email subject line
            html_content: HTML body content
            plain_text: Optional plain text fallback

        Returns:
            True if email sent successfully, False otherwise
        """
        if not self.is_configured():
            logger.warning("Email not configured - skipping send")
            return False

        if not recipients:
            logger.warning("No recipients specified")
            return False

        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.from_address
            msg["To"] = ", ".join(recipients)

            # Add plain text part (fallback)
            if plain_text:
                text_part = MIMEText(plain_text, "plain")
                msg.attach(text_part)

            # Add HTML part
            html_part = MIMEText(html_content, "html")
            msg.attach(html_part)

            # Create secure SSL context
            context = ssl.create_default_context()

            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_address, recipients, msg.as_string())

            logger.info(f"Report sent to {len(recipients)} recipient(s)")
            return True

        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed: {e}")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

    def send_weekly_report(
        self,
        recipients: List[str],
        html_content: str,
        report_date: Optional[str] = None
    ) -> bool:
        """Send the weekly strategic intelligence report.

        Args:
            recipients: List of email addresses
            html_content: HTML report content
            report_date: Optional date string for subject line

        Returns:
            True if sent successfully
        """
        if report_date is None:
            report_date = datetime.utcnow().strftime("%Y-%m-%d")

        subject = f"Fintech Competitive Intelligence Report - {report_date}"

        return self.send_report(
            recipients=recipients,
            subject=subject,
            html_content=html_content,
            plain_text="Please view this email in an HTML-capable email client."
        )

    def send_alert(
        self,
        recipients: List[str],
        company: str,
        alert_type: str,
        details: str
    ) -> bool:
        """Send an immediate alert for significant hiring activity.

        Args:
            recipients: List of email addresses
            company: Company name
            alert_type: Type of alert (e.g., "leadership_hire", "expansion")
            details: Alert details

        Returns:
            True if sent successfully
        """
        subject = f"Alert: {company} - {alert_type.replace('_', ' ').title()}"

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; }}
        .alert-box {{ background: #fff5f5; border: 1px solid #e74c3c; border-radius: 8px; padding: 20px; }}
        .alert-title {{ color: #e74c3c; margin: 0 0 10px 0; }}
    </style>
</head>
<body>
    <div class="alert-box">
        <h2 class="alert-title">Competitive Intelligence Alert</h2>
        <p><strong>Company:</strong> {company}</p>
        <p><strong>Type:</strong> {alert_type.replace('_', ' ').title()}</p>
        <p><strong>Details:</strong></p>
        <p>{details}</p>
    </div>
    <p style="color: #999; font-size: 0.85em; margin-top: 20px;">
        Sent by Fintech Job Intelligence System
    </p>
</body>
</html>
"""

        return self.send_report(
            recipients=recipients,
            subject=subject,
            html_content=html_content
        )

    def test_connection(self) -> bool:
        """Test the SMTP connection.

        Returns:
            True if connection successful
        """
        if not self.is_configured():
            logger.error("Email not configured")
            return False

        try:
            context = ssl.create_default_context()
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(self.smtp_user, self.smtp_password)
                logger.info("SMTP connection test successful")
                return True
        except Exception as e:
            logger.error(f"SMTP connection test failed: {e}")
            return False
