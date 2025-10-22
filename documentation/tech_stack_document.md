# xbrl-converter-suite: Tech Stack Document

This document explains, in clear terms, the technology choices behind the xbrl-converter-suite. Whether youre a project manager, business stakeholder, or end user, this guide shows why each tool and framework was chosen and how it powers a robust XBRL financial data conversion and analytics platform.

## 1. Frontend Technologies

Our goal on the frontend is to deliver a fast, responsive, and accessible user interface where users can upload documents, track conversions, and view analytics. Here are the main technologies:

- **Next.js 15 (App Router)**  
  A React-based framework that provides built-in routing, server-side rendering, and incremental static regeneration. It makes pages load quickly and keeps navigation smooth.

- **React & `shadcn/ui`**  
  React is the core library for building interfaces. `shadcn/ui` is a collection of ready-made React components (buttons, forms, tables, charts wrappers) styled with Tailwind CSS. It speeds up UI development and ensures visual consistency.

- **Tailwind CSS**  
  A utility-first styling framework that lets us compose designs directly in markup. It keeps CSS code minimal and promotes a consistent design system.

- **`next-themes`**  
  Integrates dark mode and theming into the Next.js app with minimal setup, giving users control over light/dark appearance.

- **Charting Library (Recharts or Chart.js)**  
  Used inside custom `shadcn/ui` wrappers to visualize financial data (trends, ratios, comparisons) in the analytics dashboard.

- **Testing Tools (Jest & React Testing Library)**  
  Ensure that UI components, forms, and workflows behave as expected. Automated tests help us catch regressions early.

How these choices enhance the user experience:

- Rapid page loads and smooth navigation (Next.js SSR/ISR)  
- Consistent, polished look and feel (Tailwind + shadcn/ui)  
- Easy theming and accessibility (next-themes)  
- Interactive, insightful charts (Recharts/Chart.js)  
- Reliable behavior through automated testing

## 2. Backend Technologies

The backend handles user authentication, file conversions, data storage, and business logic. It is designed for type safety, maintainability, and scalability.

- **Next.js API Routes**  
  Serverless endpoints built into Next.js. They orchestrate file uploads, parsing, canonical model transformation, taxonomy lookup, and XBRL generation.

- **Better Auth**  
  A modern authentication library that secures user sign-up, login, password resets, and session management. It also supports role-based access controls.

- **PostgreSQL**  
  A proven relational database for structured data. It stores user profiles, file metadata, conversion statuses, canonical model entries, and the hierarchical taxonomy data.

- **Drizzle ORM**  
  A TypeScript-first ORM that enforces type safety for all database interactions. It defines tables and queries in code, reducing runtime errors and drifts between code and schema.

- **File Parsers (papaparse, xlsx)**  
  - `papaparse` for CSV uploads  
  - `xlsx` for Excel files  
  These libraries extract raw tables into JavaScript objects.

- **Python FastAPI Microservice (Optional)**  
  For AI-driven PDF parsing. A separate service can use machine-learning models to extract data from unstructured documents, allowing the main app to stay lean.

- **Background Job Queue (Inngest, Vercel Cron Jobs, or a simple DB-based queue)**  
  Asynchronous processing of large conversions. Users receive a job ID immediately, and the UI polls for status updates, keeping the interface responsive.

Together, these components:

- Securely handle user data and file workflows (Better Auth + Next.js API).  
- Store and query complex financial data reliably (PostgreSQL + Drizzle).  
- Scale parsing and conversion tasks without blocking the user (background jobs).  
- Keep conversion logic modular and maintainable (API Routes + `/lib` directory).

## 3. Infrastructure and Deployment

To ensure consistency across environments and easy deployment, we rely on the following:

- **Git & GitHub**  
  Version control for source code, pull requests, branching strategies, and code reviews.

- **Docker**  
  Defines local development containers for PostgreSQL and any microservices (e.g., the Python parser). Guarantees that every developer has the same stack.

- **Vercel**  
  Hosting and deployment platform optimized for Next.js. Provides automatic builds, previews for each pull request, built-in SSL, and global CDN.

- **CI/CD Pipeline**  
  - GitHub Actions or Vercel’s built-in pipeline to run tests, linting, and builds on every push.  
  - Automatic promotion from staging to production when code is merged into the main branch.

- **Blob Storage**  
  - **Vercel Blob**, **AWS S3**, or **Cloudflare R2** for storing uploaded source files and generated XBRL outputs.  
  - Only metadata and URLs are kept in PostgreSQL, keeping the database lean.

These choices help us:

- Maintain a single source of truth for code (GitHub).  
- Replicate environments reliably (Docker).  
- Deploy with zero-downtime and global performance (Vercel + CDN).  
- Automate quality checks (CI/CD).  
- Store large file blobs cost-effectively (external storage).

## 4. Third-Party Integrations

Although the core conversion logic is built in-house, we rely on a few external services to round out the platform:

- **AI Document Parsing Agent**  
  - A Python/FastAPI microservice (optional) that can leverage AI models (e.g., OpenAI or custom ML pipelines) for extracting data from PDFs.
  - Benefit: higher accuracy on unstructured formats without overloading the main app.

- **Charting Libraries (Recharts or Chart.js)**  
  - NPM libraries that integrate with React to display financial analytics in the dashboard.
  - Benefit: out-of-the-box charts save development time and ensure responsive visuals.

- **Background Job Service (Inngest or Vercel Cron Jobs)**  
  - Managed service to schedule and process long-running conversion jobs.
  - Benefit: asynchronous workflows that keep the user interface snappy.

- **Blob Storage Services**  
  - Vercel Blob, AWS S3, or Cloudflare R2 for file storage.  
  - Benefit: scalable, durable storage with built-in redundancy.

These integrations let us focus on core financial logic while leveraging best-in-class solutions for specialized tasks.

## 5. Security and Performance Considerations

Security and performance are top priorities given the sensitive nature of financial data:

- **Authentication & Authorization**  
  - Better Auth with secure password hashing, session management, and optional multi-factor authentication.  
  - Role-based access controls ensure users cannot view others’ data.

- **Data Protection**  
  - HTTPS everywhere (TLS) for all client-server communication.  
  - Environment variables for secrets (database URLs, API keys).  
  - Least-privilege database roles.

- **Type Safety & Validation**  
  - TypeScript across the stack (frontend, backend, ORM) to catch errors at compile time.  
  - Drizzle ORM’s schema enforcement prevents invalid data.

- **Performance Optimizations**  
  - Server-side rendering (SSR) and incremental static regeneration (ISR) for public pages.  
  - Caching strategies via HTTP headers and CDN.  
  - Database indexing on frequently queried fields (file status, timestamps).  
  - Lazy loading of heavy components (charts, maps) on the frontend.

- **Monitoring & Alerts (Optional)**  
  - Tools like Sentry or LogRocket for error tracking.  
  - Uptime monitoring with services such as Pingdom or UptimeRobot.

These measures protect user data and keep the app fast and reliable under load.

## 6. Conclusion and Overall Tech Stack Summary

The xbrl-converter-suite brings together modern, well-integrated technologies to meet the demanding requirements of an XBRL financial conversion and analytics platform:

- **Frontend:** Next.js 15, React, shadcn/ui, Tailwind CSS, next-themes, charting libraries, and a robust testing setup deliver a polished, responsive user experience.

- **Backend:** Next.js API Routes, Better Auth, PostgreSQL, Drizzle ORM, file parsers, optional Python AI microservices, and background job handling provide a secure, maintainable, and scalable data pipeline.

- **Infrastructure & Deployment:** Git + GitHub, Docker, Vercel, CI/CD pipelines, and external blob storage guarantee consistent environments, fast global performance, and straightforward deployments.

- **Third-Party Integrations:** Charting libraries, AI parsing agents, job queue services, and cloud storage cover specialized needs without reinventing the wheel.

- **Security & Performance:** TLS encryption, role-based auth, type-safe code, caching, database tuning, and monitoring ensure data integrity and a smooth user experience.

Together, these choices align perfectly with the projects goals of secure document conversion, accurate financial analysis, and a user-friendly dashboard. The modular, type-safe, and cloud-native architecture sets xbrl-converter-suite apart as a future-proof foundation for any financial reporting workflow.