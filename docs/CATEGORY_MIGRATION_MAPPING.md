# Category Migration Mapping

**Date:** January 27, 2026  
**Purpose:** Document old → new category mappings for data migration

## Old to New Category Mappings

### Direct Mappings (No Change)
- `engineering-backend` → `engineering-backend`
- `engineering-frontend` → `engineering-frontend`
- `engineering-fullstack` → `engineering-fullstack`
- `engineering-mobile` → `engineering-mobile`
- `engineering-data` → `engineering-data`
- `engineering-security` → `engineering-security`
- `engineering-qa` → `engineering-qa`
- `product-management` → `product-management`
- `product-research` → `product-research`
- `customer-support` → `customer-support-cx` (moved to Operations & People group)

### Renamed Categories
- `engineering-ml` → `engineering-ai-ml`
- `engineering-devops` → `engineering-platform-sre-devops`
- `product-design` → `product-design-ux`
- `data-analytics` → `data-analytics-bi`
- `sales` → `sales-account-executives`
- `customer-success` → `account-management-customer-success`
- `finance` → `finance-accounting`
- `hr-people` → `people-ops-hr`
- `operations` → `business-operations`
- `leadership` → `executive-leadership`
- `marketing-growth` → `marketing-growth-performance`

### Merged Categories
- `marketing-product`, `marketing-content`, `marketing-brand` → `marketing-product-brand`

### Split Categories
- `legal-compliance` → Split into:
  - `compliance` (Risk, Legal & Compliance group)
  - `legal` (Risk, Legal & Compliance group)
- `risk` → Split into:
  - `risk-management` (Risk, Legal & Compliance group)
  - `fraud-trust-safety` (Risk, Legal & Compliance group)

### New Categories (No Old Mapping)
- `engineering-management`
- `technical-program-management`
- `technical-writing`
- `data-science`
- `analytics-engineering`
- `aml-financial-crime`
- `regulatory-affairs`
- `business-development-partnerships`
- `solutions-engineering`
- `revenue-operations`
- `developer-relations`
- `strategic-finance-fpa`
- `capital-markets-treasury`
- `corporate-development-strategy`
- `investor-relations`
- `customer-operations`
- `talent-acquisition-recruiting`
- `it-internal-systems`
- `administrative`

## Migration Rules

1. **Direct mappings**: Use exact match
2. **Renamed categories**: Map old slug to new slug
3. **Merged categories**: Map all old categories to new merged category
4. **Split categories**: 
   - `legal-compliance` → `compliance` (default, can be refined later)
   - `risk` → `risk-management` (default, can be refined later)
5. **New categories**: Leave as `other` until re-categorized by AI

## Group Changes

### Old Groups (6)
- Engineering
- Product
- Marketing
- Go-to-Market
- Operations
- Leadership
- Other

### New Groups (7)
- Engineering
- Product & Design
- Data & Analytics
- Risk, Legal & Compliance
- Go-To-Market
- Finance & Strategy
- Operations & People
- Other
