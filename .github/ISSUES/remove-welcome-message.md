# Remove Personalized Welcome Message

## TL;DR
Remove the personalized welcome banner ("Good morning, [Name]!") from the dashboard as it's an unnecessary distraction.

## Type
**Improvement** - UI Cleanup

## Priority
**Normal**

## Effort
**Small** (remove component and usage)

## Current State
- Dashboard shows a personalized welcome message banner at the top
- Displays greeting based on time of day ("Good morning/afternoon/evening, [Name]!")
- Includes dismiss button and welcome text
- Takes up space at the top of the dashboard

## Expected Outcome
- Remove the welcome message banner entirely
- Dashboard starts directly with stats cards and content
- Cleaner, more focused dashboard experience

## Files to Modify
- `web/app/(dashboard)/page.tsx` - Remove WelcomeMessage import and usage
- `web/components/dashboard/WelcomeMessage.tsx` - Can be deleted (or kept for potential future use)

## Notes
- Low risk change - purely UI removal
- No data dependencies to clean up
- Component can be kept in codebase if there's potential future use, just remove the import/usage
