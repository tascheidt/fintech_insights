-- Fix Tangerine company configuration
-- The careers site is actually a Scotiabank SuccessFactors portal, not Workday.
-- The old careers_url (jobs.tangerine.ca) no longer resolves.

UPDATE companies
SET
  ats_type = 'scotiabank',
  ats_identifier = 'Tangerine',
  careers_url = 'https://jobs.scotiabank.com/Tangerine/search/'
WHERE slug = 'tangerine';
