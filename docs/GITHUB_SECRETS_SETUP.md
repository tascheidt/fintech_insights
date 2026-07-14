# GitHub Secrets Setup Guide

This guide shows you how to add the required secrets to your GitHub repository for the Heavy Scraper workflow.

## Required Secrets

The workflow needs these two secrets:

1. `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
2. `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for admin operations)

The weekly scraper-drift-check workflow (`scraper-drift-check.yml`) additionally needs:

3. `RESEND_API_KEY` - Resend API key, so drift findings can be emailed to admins (same value as the Vercel env var)

The full secret-per-workflow matrix lives in [`CRON_TOPOLOGY.md`](./CRON_TOPOLOGY.md) → "Required secrets".

## Step-by-Step Instructions

### Step 1: Find Your Supabase Credentials

#### Finding `NEXT_PUBLIC_SUPABASE_URL`:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API** (or **Project Settings** → **API**)
4. Find **Project URL** - it looks like: `https://xxxxx.supabase.co`
5. Copy this value

#### Finding `SUPABASE_SERVICE_ROLE_KEY`:

1. In the same **Settings** → **API** page
2. Scroll down to **Project API keys**
3. Find the **`service_role`** key (⚠️ **Secret** - starts with `eyJ...`)
4. **⚠️ IMPORTANT**: This key has admin privileges - keep it secret!
5. Click the **eye icon** to reveal it, then copy the value

**Note**: The `anon` key is public and safe to expose. The `service_role` key bypasses Row Level Security (RLS) and should NEVER be exposed publicly.

### Step 2: Add Secrets to GitHub

1. **Navigate to your GitHub repository**
   - Go to `https://github.com/YOUR_USERNAME/YOUR_REPO`

2. **Open Settings**
   - Click the **Settings** tab (top navigation bar)

3. **Go to Secrets**
   - In the left sidebar, click **Secrets and variables** → **Actions**
   - (Or navigate directly to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions`)

4. **Add `NEXT_PUBLIC_SUPABASE_URL`**
   - Click **New repository secret**
   - **Name**: `NEXT_PUBLIC_SUPABASE_URL`
   - **Secret**: Paste your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
   - Click **Add secret**

5. **Add `SUPABASE_SERVICE_ROLE_KEY`**
   - Click **New repository secret** again
   - **Name**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Secret**: Paste your service role key (starts with `eyJ...`)
   - Click **Add secret**

### Step 3: Verify Secrets Are Added

You should now see both secrets listed:
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`

**Note**: Once added, you cannot view the secret values again (for security). You can only update or delete them.

## Testing the Workflow

After adding the secrets:

1. Go to the **Actions** tab in your repository
2. Click **Heavy Scraper** workflow in the left sidebar
3. Click **Run workflow** button (top right)
4. Enter a `company_id` (UUID from your `companies` table)
5. Click **Run workflow**

The workflow will use the secrets automatically - you don't need to reference them in the workflow file.

## Security Best Practices

- ✅ **Never commit secrets to your repository**
- ✅ **Never share service role keys publicly**
- ✅ **Use GitHub Secrets for all sensitive values**
- ✅ **Rotate keys if accidentally exposed**
- ✅ **Limit access to repository settings**

## Troubleshooting

### "Secret not found" error
- Verify the secret names match exactly (case-sensitive)
- Check that you're in the correct repository
- Ensure secrets are added under **Actions** secrets (not Dependabot or Codespaces)

### "Unauthorized" error
- Verify your `SUPABASE_SERVICE_ROLE_KEY` is correct
- Check that the key hasn't been rotated in Supabase
- Ensure you copied the full key (they're long JWT tokens)

### "Invalid URL" error
- Verify `NEXT_PUBLIC_SUPABASE_URL` includes `https://`
- Check that the URL matches your Supabase project exactly
- Ensure there are no trailing spaces or newlines

## Quick Reference

**Supabase Dashboard Paths:**
- Project URL: **Settings** → **API** → **Project URL**
- Service Role Key: **Settings** → **API** → **Project API keys** → **`service_role`** (click eye icon)

**GitHub Secrets Path:**
- Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
