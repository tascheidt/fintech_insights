# Email Setup Guide (Resend)

This guide covers setting up Resend for sending weekly intelligence reports via email.

## Overview

The app uses **Resend** to send weekly email reports containing:
- Active job counts
- New jobs this week
- Recent strategic insights
- Links to the dashboard

Reports are sent automatically via Vercel Cron (weekly on Mondays at 8:00 UTC).

## Step 1: Create Resend Account

1. Go to [Resend.com](https://resend.com/signup)
2. Sign up with your email address
3. Verify your email

## Step 2: Get API Key

1. Go to [Resend Dashboard](https://resend.com/api-keys)
2. Click **Create API Key**
3. Give it a name: "Fintech Intelligence Reports"
4. Select permissions: **Sending access**
5. Click **Add**
6. **IMPORTANT**: Copy the API key immediately (starts with `re_`). You won't see it again!

## Step 3: Domain Verification (Optional but Recommended)

To send from your own domain instead of `onboarding@resend.dev`:

### 3.1 Add Domain in Resend

1. Go to [Resend Domains](https://resend.com/domains)
2. Click **Add Domain**
3. Enter your domain (e.g., `yourcompany.com`)
4. Click **Add**

### 3.2 Add DNS Records

Resend will show you DNS records to add. Add them to your domain's DNS provider:

**Example DNS records:**
```
Type: TXT
Name: @
Value: resend._domainkey=...

Type: MX
Name: @
Priority: 10
Value: feedback-smtp.resend.com
```

### 3.3 Verify Domain

- Resend will automatically verify once DNS propagates (can take up to 48 hours)
- Status will show **Verified** when ready

## Step 4: Configure Environment Variables

Update `web/.env.local` with your Resend credentials:

```bash
# Resend Email Configuration
RESEND_API_KEY=re_xxxxxxxxxxxxx  # Your API key from Step 2
RESEND_FROM=reports@yourdomain.com  # Your verified domain, or onboarding@resend.dev for testing
REPORT_EMAIL=team@yourdomain.com  # Where to send weekly reports
```

**For testing without domain verification:**
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM=onboarding@resend.dev  # Resend's test domain
REPORT_EMAIL=your-email@gmail.com
```

## Step 5: Test Email Sending

### Option 1: Test via API Route

You can manually trigger the report endpoint to test:

```bash
curl -X GET "http://localhost:3000/api/cron/report" \
  -H "Authorization: Bearer fintech_cron_secret_2026_a8f3b2c1d9e7"
```

Replace `fintech_cron_secret_2026_a8f3b2c1d9e7` with your `CRON_SECRET` from `.env.local`.

### Option 2: Test in Production

Once deployed to Vercel, you can test via Vercel Cron or manually trigger:

```bash
curl -X GET "https://your-app.vercel.app/api/cron/report" \
  -H "Authorization: Bearer <your-cron-secret>"
```

## Step 6: Configure Vercel Environment Variables

When deploying to Vercel, add these environment variables:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → Your Project → Settings → Environment Variables
2. Add:
   - `RESEND_API_KEY` = `re_xxxxxxxxxxxxx`
   - `RESEND_FROM` = `reports@yourdomain.com` (or `onboarding@resend.dev`)
   - `REPORT_EMAIL` = `team@yourdomain.com`
   - `CRON_SECRET` = (your secret value)
3. Apply to **Production**, **Preview**, and **Development** environments

## Email Report Schedule

Reports are sent automatically via Vercel Cron:
- **Schedule**: Every Monday at 8:00 UTC
- **Route**: `/api/cron/report`
- **Method**: GET with `Authorization: Bearer <CRON_SECRET>` header

To change the schedule, update `web/vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/report",
      "schedule": "0 8 * * 1"  // Monday 8:00 UTC
    }
  ]
}
```

## Email Content

The weekly report includes:
- **Summary stats**: Active jobs, new jobs this week, insights count
- **Recent insights**: Top 10 strategic insights with company and job title
- **Link to dashboard**: Direct link to view full details

## Troubleshooting

### "Failed to send email" error

1. **Check API key**: Verify `RESEND_API_KEY` is correct and starts with `re_`
2. **Check FROM address**: Must be verified domain or `onboarding@resend.dev`
3. **Check logs**: Vercel logs will show the specific Resend error
4. **Rate limits**: Resend free tier allows 3,000 emails/month

### Emails going to spam

1. **Use verified domain**: Sending from `onboarding@resend.dev` may have lower deliverability
2. **Add SPF/DKIM**: Resend automatically configures these when you verify a domain
3. **Warm up domain**: Start with low volume and gradually increase

### No emails received

1. **Check REPORT_EMAIL**: Verify the email address is correct
2. **Check spam folder**: Emails might be filtered
3. **Test manually**: Use curl command to trigger report and check response
4. **Check Vercel logs**: See if the cron job is running and if there are errors

### "Domain not verified" error

- If using `RESEND_FROM=reports@yourdomain.com`, the domain must be verified in Resend
- Use `onboarding@resend.dev` for testing without verification

## Cost

- **Resend Free Tier**: 3,000 emails/month, 100 emails/day
- **Resend Pro**: $20/month for 50,000 emails
- See [Resend Pricing](https://resend.com/pricing) for details

## Next Steps

- Set up multiple recipients (modify `REPORT_EMAIL` to support comma-separated list)
- Customize email template in `web/app/api/cron/report/route.ts`
- Set up email alerts for important insights (future enhancement)
