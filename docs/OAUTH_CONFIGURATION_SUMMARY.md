# OAuth Configuration Summary

## Quick Answer: What Needs to Be Configured Where?

### ✅ Google Cloud Console (Already Done)
**Purpose:** Tells Google where to redirect after authentication

**Configuration:**
- **Authorized redirect URIs:** `https://joqruwbipwmaysufhgyc.supabase.co/auth/v1/callback`
- ✅ This is correctly configured in your Google Cloud Console

### ⚠️ Supabase Dashboard (Needs Configuration)
**Purpose:** Tells Supabase where to redirect after processing Google's auth response

**Two things to configure:**

#### 1. Google Provider Settings
**Location:** Authentication → Sign In / Providers → Google

**What to add:**
- Client ID: `153898442207-t1586jbc2cjjhst4jbgbm1h3l3e6hihe.apps.googleusercontent.com`
- Client Secret: (from Google Cloud Console)

**Status:** ✅ Google is enabled - verify credentials are correct

#### 2. URL Configuration (THIS IS THE MISSING PIECE!)
**Location:** Authentication → Configuration → URL Configuration

**What to add:**

**Redirect URLs** (where Supabase can redirect after auth):
```
https://your-vercel-app-name.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

**Site URL** (default redirect destination):
```
https://your-vercel-app-name.vercel.app
```

## The OAuth Flow Explained

```
User clicks "Sign in" 
  ↓
Your App (Vercel)
  ↓ redirects to
Supabase OAuth endpoint
  ↓ redirects to  
Google OAuth
  ↓ user authenticates
Google redirects to
  ↓
Supabase callback: https://joqruwbipwmaysufhgyc.supabase.co/auth/v1/callback
  ↓ Supabase processes auth
Supabase redirects to
  ↓
Your App callback: https://your-app.vercel.app/auth/callback
  ↓
User is logged in!
```

## Why You're Getting Redirected to Localhost

When Supabase tries to redirect to your Vercel domain after authentication, it checks if that domain is in the **Redirect URLs** list. If it's not there, Supabase may:
1. Reject the redirect
2. Fall back to the Site URL (if set to localhost)
3. Use a default/fallback behavior

**Solution:** Add your Vercel domain to Supabase's Redirect URLs list.

## Checklist

- [x] Google Cloud Console: Supabase callback URL configured
- [ ] Supabase: Google Client ID and Secret configured
- [ ] Supabase: Vercel domain added to Redirect URLs
- [ ] Supabase: Site URL set to Vercel domain
- [ ] Test authentication on Vercel deployment

## Where to Find These Settings

### Supabase Dashboard
1. **Google Provider:** https://supabase.com/dashboard/project/joqruwbipwmaysufhgyc/auth/providers
2. **URL Configuration:** https://supabase.com/dashboard/project/joqruwbipwmaysufhgyc/auth/url-configuration

### Google Cloud Console
- **OAuth Client:** https://console.cloud.google.com/apis/credentials
