# xbrl-converter-suite: Backend Structure Document

This document explains the backend setup for the xbrl-converter-suite, an XBRL financial data conversion and analytics platform. It covers architecture, databases, APIs, hosting, security, monitoring, and more, using everyday language.

## 1. Backend Architecture

### Overview
- We use Next.js 15 (App Router) on the server side. Its API Routes handle all the business logic, keeping frontend and backend neatly separated.  
- Conversion tasks, file parsing, and XBRL generation live in server-side modules under `/lib`.  
- Better Auth handles user authentication flows, so we don’t build that from scratch.

### Design Patterns and Frameworks
- **Server-centric logic:** Heavy work (file parsing, AI calls, DB queries) runs on the server. Frontend just calls simple endpoints.  
- **Modular structure:** We group file parsers, canonical model code, and XBRL generator into clear folders, making it easy to add or swap components.  
- **Type-safe ORM:** Drizzle ORM ties TypeScript types to your database schemas, catching mistakes at build time.

### Scalability, Maintainability, Performance
- **Scalability:** Serverless functions on Vercel (or your cloud of choice) auto-scale with demand.  
- **Maintainability:** Clear folder structure (`/app`, `/api`, `/lib`, `/db`) means new developers find what they need quickly.  
- **Performance:** Next.js Server Components and API Routes run close to the data, reducing latency. We can also offload heavy jobs to background queues.

---

## 2. Database Management

### Technologies Used
- **Type:** Relational (SQL)  
- **System:** PostgreSQL  
- **ORM:** Drizzle ORM (TypeScript-first)

### Data Structure and Access
- We keep separate tables for users, file uploads, conversion jobs, taxonomy rules, and the canonical model data.  
- All access goes through Drizzle’s query builder, ensuring type safety and consistency.  
- We store large files (PDF, Excel, generated XBRL) in external blob storage (e.g., AWS S3 or Vercel Blob) and save only URLs in our DB.

### Data Management Practices
- **Migrations:** Use Drizzle migrations to evolve schema safely.  
- **Backups:** Scheduled backups of PostgreSQL, stored off-site.  
- **Indexes:** Add indexes on foreign keys and timestamps for fast queries (e.g., status checks).

---

## 3. Database Schema

Here’s a human-friendly overview followed by SQL definitions.

### Human-Readable Schema
- **Users:** Stores user accounts and authentication info.  
- **Files:** Tracks uploaded files, their status, and links to results.  
- **Conversions:** Represents each conversion job, its input, status, and output link.  
- **Taxonomy:** Holds financial taxonomy entries in a hierarchy (parent/child relationships).  
- **CanonicalData:** Stores standardized financial values extracted from reports.

### SQL Schema (PostgreSQL)
```sql
-- 1. Users table (Better Auth integration)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Files table
CREATE TABLE files (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  upload_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_url TEXT NOT NULL
);

-- 3. Conversions table
CREATE TABLE conversions (
  id UUID PRIMARY KEY,
  file_id UUID REFERENCES files(id),
  status TEXT NOT NULL,        -- e.g., 'queued', 'processing', 'done', 'error'
  xbrl_url TEXT,              -- URL to the generated XBRL file
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

-- 4. Taxonomy table
CREATE TABLE taxonomy (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_code TEXT REFERENCES taxonomy(code),
  sector TEXT,
  report_type TEXT,           -- e.g., 'balance_sheet', 'cash_flow'
  description TEXT
);

-- 5. CanonicalData table
CREATE TABLE canonical_data (
  id UUID PRIMARY KEY,
  conversion_id UUID REFERENCES conversions(id),
  taxonomy_code TEXT REFERENCES taxonomy(code),
  value NUMERIC,
  unit TEXT,
  period_start DATE,
  period_end DATE
);
```  

---

## 4. API Design and Endpoints

We follow a RESTful style with clear, intuitive routes.

### Authentication
- `POST /api/auth/signup` – Create a new account.  
- `POST /api/auth/login` – Log in and receive a session.  
- `POST /api/auth/logout` – End the session.

### Conversion Workflow
- `POST /api/convert` – Upload a file and start conversion (returns job ID).  
- `GET /api/convert/status/:id` – Check conversion status by job ID.  
- `GET /api/convert/download/:id` – Download the resulting XBRL when ready.

### Analytics and Taxonomy
- `GET /api/analytics/summary` – Fetch high-level metrics and trends.  
- `GET /api/analytics/detail` – Get detailed, filterable data points.  
- `GET /api/taxonomy` – Retrieve taxonomy entries or a subtree.

### Job Queue (Optional)
- We can integrate a worker or microservice that polls a `conversions` table for `queued` jobs.

---

## 5. Hosting Solutions

### Environment
- **Development:** Docker containers for Next.js, PostgreSQL, and any microservices (e.g., AI parser).  
- **Production:** Vercel for the Next.js app (serverless functions), AWS S3 or Vercel Blob for file storage, and a managed PostgreSQL service (e.g., AWS RDS or Supabase).

### Benefits
- **Reliability:** Vercel and managed DB services handle failover and backups.  
- **Scalability:** Serverless functions auto-scale under load. Blob storage scales infinitely.  
- **Cost-effectiveness:** Pay-per-use for functions and storage; only run DB during active use.

---

## 6. Infrastructure Components

### Load Balancing and CDN
- Vercel’s global edge network automatically routes requests to the nearest region.  
- Static assets and XBRL downloads served via CDN for fast delivery.

### Caching
- Use HTTP caching headers on analytics endpoints.  
- Optionally add a Redis layer for hot taxonomy lookups or conversion status.

### Background Jobs
- Inngest, Vercel Cron Jobs, or a simple polling worker can pick up queued conversions and process them asynchronously.

---

## 7. Security Measures

### Authentication & Authorization
- **Better Auth** provides signup/login, session management, and role-based access control.  
- API routes check user identity and ensure they only access their own files and conversions.

### Data Encryption
- **In transit:** All endpoints served over HTTPS.  
- **At rest:** Blob storage and PostgreSQL use built-in encryption features.

### Environment and Secrets
- Store API keys, DB credentials, and service tokens in environment variables or a secrets manager (e.g., AWS Secrets Manager).

### Compliance
- Audit logs for critical actions (file upload, conversion start/end).  
- Data retention policies can be enforced via scheduled cleanup jobs.

---

## 8. Monitoring and Maintenance

### Monitoring Tools
- **Vercel Dashboard:** Function invocations, latencies, error rates.  
- **Sentry or LogDNA:** Capture exceptions in API routes or worker processes.  
- **Prometheus & Grafana (optional):** Track DB performance, queue depths, and resource usage.

### Maintenance Strategies
- **Automated Backups:** Regular DB dumps stored off-site.  
- **Schema Migrations:** Drizzle migrations run as part of CI/CD.  
- **Health Checks:** A simple `/api/health` endpoint returns service status.
- **Dependency Updates:** Use Dependabot or Renovate to keep libraries up to date.

---

## 9. Conclusion and Overall Backend Summary

The xbrl-converter-suite backend is built for clarity, scalability, and security. By combining Next.js serverless API Routes, TypeScript-first ORM, and managed cloud services, we get a system that:  

- Lets users upload financial files and track conversions easily.  
- Stores data in a well-structured PostgreSQL database with clear schemas.  
- Scales transparently under load via serverless functions and CDN.  
- Provides secure, role-based access to sensitive financial data.  
- Allows easy extension with new parsers, analytics, or microservices.

This setup aligns perfectly with the project’s goal: a reliable, maintainable platform for converting and analyzing financial reports in XBRL format. Any developer or stakeholder can read this document and understand how to run, extend, and maintain the system without ambiguity.