# Authentication Setup Guide

This guide covers setting up user authentication with Supabase Auth using Google OAuth.

## Overview

The web app uses **Supabase Auth** with Google OAuth for single sign-on. When users sign in:

1. They're redirected to Google for authentication
2. After approval, Supabase creates a user account in `auth.users`
3. A database trigger automatically creates a `profile` record in `profiles` table
4. The profile is assigned to the default organization with role `viewer`
5. Row Level Security (RLS) policies ensure users only see data from their organization

## Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. If prompted, configure OAuth consent screen:
   - Choose **External** (unless you have a Google Workspace)
   - Fill in app name: "Fintech Intelligence"
   - Add your email as support contact
   - Add scopes: `email`, `profile`, `openid`
   - Add test users (optional for testing)
6. Create **Web application** OAuth client:
   - Name: "Fintech Intelligence Web"
   - **Authorized redirect URIs**: Add:
     ```
     https://joqruwbipwmaysufhgyc.supabase.co/auth/v1/callback
     ```
7. Copy **Client ID** and **Client Secret**

## Step 2: Configure Google in Supabase

**You need to configure TWO things in Supabase:**

### Part A: Google Provider Settings

1. Go to [Supabase Dashboard - Auth Providers](https://supabase.com/dashboard/project/joqruwbipwmaysufhgyc/auth/providers)
2. Scroll to **Google** provider
3. Click on the **Google** provider (or click "Enabled" to edit)
4. Paste your **Client ID** from Google Cloud Console:
   ```
   153898442207-t1586jbc2cjjhst4jbgbm1h3l3e6hihe.apps.googleusercontent.com
   ```
5. Paste your **Client Secret** from Google Cloud Console
6. Click **Save**

**Note:** If Google is already enabled, you still need to verify these credentials are correct.

### Part B: URL Configuration (CRITICAL - This fixes the localhost redirect issue!)

## Step 2.5: Configure Redirect URLs in Supabase (IMPORTANT for Vercel)

**This is critical for Vercel deployments!** After Google authenticates the user, Supabase needs to know which domains are allowed to receive the final redirect back to your app.

**Why this matters:**
- Google Cloud Console tells Google: "After auth, redirect to Supabase" ✅ (You've done this)
- Supabase needs to know: "After I process the auth, which app domains can I redirect to?" ⚠️ (This is what you need to configure)

**Steps:**

1. Go to [Supabase Dashboard - Authentication → URL Configuration](https://supabase.com/dashboard/project/joqruwbipwmaysufhgyc/auth/url-configuration)
   - In the left sidebar: Authentication → Configuration → URL Configuration

2. Under **Redirect URLs**, add your Vercel domain(s):
   ```
   https://your-app-name.vercel.app/auth/callback
   ```
   If you have a custom domain:
   ```
   https://your-custom-domain.com/auth/callback
   ```
   Also add localhost for development:
   ```
   http://localhost:3000/auth/callback
   ```

3. Under **Site URL**, set your production domain:
   ```
   https://your-app-name.vercel.app
   ```
   (This is the default redirect destination after successful auth)

4. Click **Save**

**Important:** 
- If you don't add your Vercel domain to Redirect URLs, Supabase will reject the redirect and may fall back to localhost
- The redirect URL must match EXACTLY (including `/auth/callback` path)
- Changes may take a few minutes to propagate

## Step 3: Test Authentication

1. Start your dev server:
   ```bash
   cd web && npm run dev
   ```
2. Navigate to `http://localhost:3000/login`
3. Click **Sign in with Google**
4. You should be redirected to Google for authentication
5. After approving, you'll be redirected back to the dashboard

## Step 4: User Roles and Organization Management

### Default Behavior

When a new user signs in:
- A `profile` is automatically created in the `profiles` table
- They're assigned to the `default` organization
- Their role is set to `viewer` (can only view data)

### Managing User Roles

To change a user's role or organization, update the `profiles` table in Supabase SQL Editor:

```sql
-- Make a user an editor
UPDATE profiles 
SET role = 'editor' 
WHERE email = 'user@example.com';

-- Make a user an admin
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'user@example.com';

-- Assign user to a different organization
UPDATE profiles 
SET organization_id = '<org-uuid>' 
WHERE email = 'user@example.com';
```

### Role Permissions

- **viewer**: Can view all data (jobs, insights, companies) but cannot modify
- **editor**: Can add/edit companies, test scrapers, view all data
- **admin**: Full access including user management and audit logs

## Step 5: Multi-Tenancy

The database uses **Row Level Security (RLS)** to ensure users only see data from their organization:

- Each `company` belongs to an `organization_id`
- Users have a `profile` with `organization_id`
- RLS policies filter queries based on `auth.uid()` and `organization_id`

To create additional organizations:

```sql
INSERT INTO organizations (name, slug)
VALUES ('Acme Corp', 'acme-corp');

-- Assign users to the organization
UPDATE profiles 
SET organization_id = (SELECT id FROM organizations WHERE slug = 'acme-corp')
WHERE email IN ('user1@example.com', 'user2@example.com');
```

## Troubleshooting

### "Redirect URI mismatch" error

- Ensure the redirect URI in Google Cloud Console matches exactly:
  ```
  https://joqruwbipwmaysufhgyc.supabase.co/auth/v1/callback
  ```
- Check for trailing slashes or typos

### Users not appearing in `profiles` table

- Check that the migration `20260117000000_initial_schema.sql` has been run
- Verify the trigger exists:
  ```sql
  SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
  ```
- Check that a `default` organization exists:
  ```sql
  SELECT * FROM organizations WHERE slug = 'default';
  ```

### "Unauthorized" errors after login

- Verify RLS policies are enabled:
  ```sql
  SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
  ```
- Check user's profile:
  ```sql
  SELECT * FROM profiles WHERE email = 'your-email@example.com';
  ```

### Google OAuth not working

1. Verify Google Cloud Console settings:
   - OAuth consent screen is configured
   - Correct redirect URI is added
   - App is published (or user is added as test user)
2. Check Supabase settings:
   - Google provider is enabled
   - Client ID and Secret are correct
   - **Redirect URLs include your Vercel domain** (see Step 2.5 above)

### Redirecting to localhost after authentication on Vercel

This happens when your Vercel domain is not in Supabase's allowed redirect URLs:

1. Go to [Supabase Dashboard - Authentication Settings](https://supabase.com/dashboard/project/joqruwbipwmaysufhgyc/auth/url-configuration)
2. Add your Vercel domain to **Redirect URLs**:
   ```
   https://your-app-name.vercel.app/auth/callback
   ```
3. Update **Site URL** to your Vercel domain
4. Save and try again

## Next Steps

- Set up email notifications (see `EMAIL_SETUP.md`)
- Configure Vercel deployment with environment variables
- Customize OAuth consent screen with your branding
