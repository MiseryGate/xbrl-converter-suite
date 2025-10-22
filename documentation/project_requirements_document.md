# Project Requirements Document (PRD)

## 1. Project Overview

The xbrl-converter-suite is a web-based platform designed to streamline the conversion of financial reports (CSV, Excel, PDF) into standardized XBRL files and to provide rich analytics on the converted data. It solves the core problem of time-consuming, error-prone manual conversions by automating file parsing, taxonomy mapping, and XBRL generation. The platform also offers a secure, multi-user environment for managing documents, tracking conversion jobs, and visualizing financial insights in real time.

This project is being built to give finance teams, auditors, and analysts an end-to-end solution that reduces manual overhead, ensures data consistency, and speeds up reporting cycles. Key objectives include: a reliable file conversion pipeline; a type-safe, extensible taxonomy database; an intuitive dashboard for uploads and analytics; and a robust security model. Success will be measured by user adoption (e.g., active users, conversion volume), accuracy of XBRL outputs (validated against standard schemas), and performance (average conversion time and UI responsiveness).

## 2. In-Scope vs. Out-of-Scope

### In-Scope (Version 1.0)
- User authentication and authorization using Better Auth with role-based access control.  
- File upload interface for CSV, Excel, and PDF documents.  
- Next.js API route (`/api/convert`) implementing the conversion workflow:  
  - Parsers for CSV and Excel using libraries like `papaparse` and `xlsx`.  
  - Integration with a Python FastAPI microservice or AI agent for unstructured PDF extraction.  
  - Data transformation into a canonical TypeScript model.  
  - Taxonomy lookup and mapping in PostgreSQL via Drizzle ORM.  
  - XBRL generation module for producing valid XBRL output.  
- Conversion job queue for asynchronous processing (using Inngest or a simple DB-backed queue).  
- Conversion history dashboard with job status, timestamps, and download links.  
- Analytics dashboard supporting basic charts (trend lines, ratios) and data tables.  
- Blob storage integration (e.g., AWS S3 or Vercel Blob) for source and output files.  
- Responsive UI built with Next.js 15 App Router, React, `shadcn/ui`, Tailwind CSS, and next-themes (light/dark).  
- Containerized development environment with Docker (PostgreSQL + microservices).  

### Out-of-Scope (Phase 2+)
- Support for additional file types beyond CSV/Excel/PDF (e.g., iXBRL imports).  
- Mobile-specific applications (native iOS/Android).  
- Advanced AI/ML features (e.g., predictive analytics, anomaly detection).  
- Integration with third-party financial systems (QuickBooks, SAP).  
- Enterprise multi-tenancy or complex user-group permissions.  
- Scheduled or automated recurring reports.  
- Full regulatory compliance certifications (e.g., SOC 2 audit).  

## 3. User Flow

A new user arrives at the platform and clicks **Sign Up**. They provide an email and password, verify their account, and log in. Upon login, they land on the **Dashboard**: a sidebar on the left lists menu items (Convert, History, Analytics, Account). The main area shows a welcome message and quick links to upload a new document or view recent conversions.

To convert a file, the user navigates to **Convert**, drags in or selects a file (CSV/Excel/PDF), and clicks **Start Conversion**. The UI immediately returns a job ID and shows it in the **History** page with status “Queued.” Behind the scenes, the backend enqueues the job, processes it, and updates status to “Completed” or “Failed.” The History page lets the user download the XBRL once ready. For deeper insights, the user visits **Analytics**, picks a time range or ratio type, and sees charts and tables that can be filtered or exported.

## 4. Core Features

- **Authentication & Authorization**: Secure sign-up, login, password reset; RBAC so users only see their data.  
- **File Upload Component**: Drag-and-drop or browse interface with client-side validation.  
- **Conversion API Route**: Endpoints to accept files, trigger parsers, and manage the pipeline.  
- **Parsers**: CSV/Excel parsers in TypeScript; AI-powered microservice for PDF extraction.  
- **Canonical Data Model**: TypeScript interfaces defining a unified structure for all financial inputs.  
- **Taxonomy Database**: PostgreSQL schemas (via Drizzle) representing financial concepts and hierarchies.  
- **XBRL Generator**: Module that turns canonical data into valid XBRL documents.  
- **Job Queue**: Asynchronous processing with status tracking and retries.  
- **Conversion History**: Table showing past jobs, statuses, timestamps, and download links.  
- **Analytics Dashboard**: Interactive charts (Recharts or Chart.js) and data tables for financial metrics.  
- **Blob Storage Integration**: Off-board file storage with metadata in the database.  
- **Theming & Responsiveness**: Light/dark mode, mobile-friendly layouts, accessible UI components.  

## 5. Tech Stack & Tools

- **Frontend**: Next.js 15 (App Router) + React + `shadcn/ui` components, Tailwind CSS, `next-themes`.  
- **Backend**: Next.js API Routes (Node.js + TypeScript).  
- **Auth**: Better Auth for secure user management.  
- **Database**: PostgreSQL, Drizzle ORM for type-safe schema and queries.  
- **Microservice (PDF AI)**: Python FastAPI service using OpenAI GPT-4 or similar for unstructured data extraction.  
- **Job Queue**: Inngest, Vercel Cron, or a simple table-based queue with polling.  
- **Blob Storage**: AWS S3, Vercel Blob, or Cloudflare R2 for source and output files.  
- **Charts**: Recharts or Chart.js for analytics visualizations.  
- **Containerization**: Docker Compose for local PostgreSQL and microservices.  
- **Deployment**: Vercel for frontend and API; Docker-based service for Python agent; optional CI/CD pipelines.  

## 6. Non-Functional Requirements

- **Performance**:  
  - UI pages should load in <2 seconds.  
  - Metadata API responses in <300ms.  
  - Average conversion end-to-end for small files (<5MB) in <10 seconds; large files handled in background jobs.  
- **Security**:  
  - TLS everywhere.  
  - Encryption at rest for sensitive data (database, blob storage).  
  - OWASP Top 10 mitigation (CSRF, XSS, SQL injection).  
  - Role-based access so users access only their conversions.  
- **Compliance**:  
  - GDPR readiness (data deletion, user consent).  
  - Audit logging of key actions (login, file upload, conversion).  
- **Usability & Accessibility**:  
  - WCAG 2.1 AA-level support.  
  - Responsive design for desktop and tablet.  
  - Clear error messages and inline validations.  

## 7. Constraints & Assumptions

- Next.js 15 App Router is available in the chosen hosting environment.  
- OpenAI (or chosen AI provider) API keys exist for the PDF parsing service.  
- PostgreSQL will handle the taxonomy’s hierarchical data without major performance issues (indexes to be added).  
- Users have modern browsers (Chrome, Safari, Edge) with JavaScript enabled.  
- Background jobs can run on a serverless schedule or a long-running process.  
- File sizes are capped at a reasonable limit (e.g., 50MB) to avoid extreme memory usage.  

## 8. Known Issues & Potential Pitfalls

- **PDF Extraction Accuracy**: AI models may misinterpret table layouts or numeric data.  
  - *Mitigation*: Provide manual correction UI, use table-detection libraries, fallback to text extraction.  
- **Taxonomy Complexity**: Maintaining large, hierarchical taxonomies in SQL can be tricky.  
  - *Mitigation*: Use well-designed relational tables, add parent/child indexes, and write efficient recursive queries.  
- **Long-Running Jobs**: Serverless functions may time out on large conversions.  
  - *Mitigation*: Offload to queue workers with retries and status polling.  
- **API Rate Limits**: Third-party AI services may throttle requests.  
  - *Mitigation*: Implement exponential backoff, batch smaller requests, cache common patterns.  
- **Schema Migrations**: Evolving the canonical data model and taxonomy could require careful migrations.  
  - *Mitigation*: Use Drizzle’s migration tool, version control SQL, and write reversible scripts.

---

This document provides a clear, unambiguous foundation for building the xbrl-converter-suite. It covers what must be delivered in version 1.0, outlines the user experience, details all core features and technologies, and flags potential risks with mitigation strategies. Subsequent technical documents (Tech Stack specifications, Frontend Guidelines, Backend Architecture, File Structure, etc.) can now be drafted with this PRD as the single source of truth.