# Fintech Competitive Intelligence Platform
## Executive Summary

### What We Built (Phase 1 - Complete)

A backend system that automatically tracks job postings from Canadian and international fintech competitors, applies AI-powered strategic analysis, and generates actionable intelligence reports.

**Current Capabilities:**
- Scrapes job postings from 5 fintech companies (105 jobs collected)
- Uses Google Gemini AI to analyze postings for strategic signals
- Generates HTML email reports with insights
- Runs on automated daily/weekly schedule
- Stores longitudinal data for trend analysis

**Companies Tracked:**
| Company | Jobs | Strategic Analysis |
|---------|------|-------------------|
| Wealthsimple | 40 | Yes |
| Questrade | 4 | Yes |
| Monzo | 51 | Templates only |
| Starling Bank | 10 | Templates only |

---

### What We're Building Next (Phase 2 - Planned)

A modern web application that puts competitive intelligence at your fingertips.

**Key Features:**

1. **Secure Access**
   - Google/Microsoft SSO login
   - Role-based permissions (viewer, editor, admin)
   - Multi-tenant support for teams

2. **Interactive Dashboard**
   - Real-time metrics and trends
   - Visual charts and comparisons
   - Searchable insights and job postings

3. **Self-Service Company Management**
   - Add new companies to track via UI
   - Test scraper connections before adding
   - Configure strategic vs. template-only tracking

4. **Job Template Library**
   - Browse by category (Engineering, Product, Marketing, etc.)
   - Full-text search
   - Copy templates for your own postings

**Tech Stack:**
- Frontend: Next.js 14 (hosted on Vercel)
- Database: PostgreSQL (Supabase)
- Auth: Supabase Auth with SSO
- AI: Google Gemini

---

### Timeline

| Phase | Timeframe | Deliverable |
|-------|-----------|-------------|
| Phase 1 | Complete | Backend system, CLI, automated reports |
| Phase 2 | 10 weeks | Web application with auth and self-service |
| Phase 3 | Future | Advanced analytics, predictions, integrations |

---

### Investment Required

**Phase 2 Development:**
- Design & frontend development
- Backend API development
- Database migration
- Authentication setup
- Testing & deployment

**Ongoing Costs (Estimated Monthly):**
| Service | Cost |
|---------|------|
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| Gemini API | ~$10-50 (usage-based) |
| Domain | ~$1 |
| **Total** | **~$60-100/month** |

---

### Business Value

1. **Early Warning System**: Know about competitor moves before they're public
2. **Strategic Planning**: Data-driven insights for product and market decisions
3. **Recruiting Advantage**: Learn from best-in-class job descriptions
4. **Time Savings**: Automated monitoring vs. manual career page checking

---

### Next Steps

1. Review and approve Phase 2 scope
2. Set up Vercel and Supabase accounts
3. Begin development sprint
4. User testing with initial group
5. Production launch

---

*For detailed technical specifications, see the full PRD document.*
