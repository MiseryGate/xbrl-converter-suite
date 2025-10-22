# Security Guidelines for xbrl-converter-suite

A tailored set of security best practices for the XBRL financial data conversion and analytics platform built on Next.js 15, PostgreSQL, Drizzle ORM, Better Auth, and shadcn/ui.

## 1. Authentication & Access Control

- **Leverage Better Auth securely**  
  • Enforce strong password policies (min. 12 characters, complexity rules, unique salts, bcrypt/Argon2).  
  • Enable Multi-Factor Authentication (MFA) for all users or at least privileged roles.  
  • Implement account lockout and rate limiting on sign-in attempts to prevent brute-force attacks.
- **Session Management**  
  • Generate cryptographically secure session identifiers.  
  • Store sessions server-side or use secure, HttpOnly, SameSite=strict cookies for JWTs.  
  • Implement idle and absolute timeouts; provide a clear logout mechanism to revoke sessions/tokens.
- **Role-Based Access Control (RBAC)**  
  • Define roles (e.g., user, analyst, admin) and map permissions to each.  
  • Enforce authorization in every API route and server component—never rely on client-side checks.  
  • Validate tokens on each request (signature, expiration, issuer, audience).

## 2. Input Handling & File Upload Security

- **General Input Validation**  
  • Treat all user input as untrusted. Implement server-side validation for API routes (`/api/convert`, `/api/analytics`).  
  • Use schema validation libraries (e.g., Zod) to enforce shapes, types, and allowed values.
- **File Uploads (CSV, Excel, PDF, etc.)**  
  • Restrict allowed file types and mime-types via an allow-list.  
  • Enforce size limits on uploads.  
  • Scan files for malware before processing.  
  • Store uploads outside the webroot or in a dedicated blob storage with restricted permissions.  
  • Sanitize filenames and prevent path traversal; generate internal file identifiers (UUIDs).
- **Prevent Injection Attacks**  
  • Use parameterized queries or Drizzle ORM’s query builder–never string-concatenate SQL.  
  • Sanitize inputs before passing to parsers.  
  • If using template engines, escape all user data to avoid template injection.

## 3. Data Protection & Privacy

- **Encryption in Transit**  
  • Enforce HTTPS/TLS 1.2+ on all endpoints.  
  • Redirect HTTP to HTTPS at the edge (Vercel, Cloudflare, etc.).
- **Encryption at Rest**  
  • Enable PostgreSQL Transparent Data Encryption or encrypt sensitive columns (e.g., proprietary taxonomy data).  
  • Encrypt blobs stored in third-party storage (S3, Vercel Blob) using server-side encryption (SSE) keys.
- **Secrets Management**  
  • Do not hardcode secrets in source. Use environment variables backed by a secrets manager (AWS Secrets Manager, Vault).  
  • Rotate keys and credentials on a regular schedule.
- **PII Handling & Logging**  
  • Mask or truncate personally identifiable information in logs and error messages.  
  • Use structured logging with levels; avoid logging full stack traces in production.

## 4. API & Service Security

- **Endpoint Protection**  
  • Require authentication on all protected API routes.  
  • Apply rate limiting and throttling per IP or account to prevent DoS/brute force (e.g., via middleware or edge functions).
- **CORS Configuration**  
  • Allow only trusted origins (e.g., your production domain).  
  • Avoid wildcard (`*`) in Access-Control-Allow-Origin.
- **Proper HTTP Methods & Versioning**  
  • Use POST for state changes (conversions), GET for reads (dashboard data), PUT/PATCH for updates, DELETE for removals.  
  • Implement API versioning (e.g., `/api/v1/convert`) to support future changes without breaking clients.

## 5. Web Application Security Hygiene

- **CSRF Protection**  
  • Implement anti-CSRF tokens on state-changing forms and AJAX calls.  
  • Use `SameSite=strict` or `lax` on cookies.
- **Security Headers**  
  • `Content-Security-Policy`: restrict script sources to self and vetted CDNs, enable `strict-dynamic` if using SRI.  
  • `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`.  
  • `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer-when-downgrade`.
- **Secure Cookies**  
  • Always `HttpOnly`, `Secure`, and set `SameSite` appropriately.
- **Subresource Integrity (SRI)**  
  • Add SRI hashes when loading third-party scripts/styles from CDNs.

## 6. Infrastructure & Configuration Management

- **Docker Hardening**  
  • Run containers as non-root users.  
  • Minimize base images; remove unnecessary packages.  
  • Scan images with container security tools (e.g., Trivy).
- **Server & Database**  
  • Change default credentials; enforce strong account passwords.  
  • Expose only required ports; block all others via firewall or security groups.  
  • Keep OS, database, and dependencies up to date with security patches.
- **TLS/SSL Configuration**  
  • Use strong cipher suites.  
  • Disable TLS 1.0/1.1 and all insecure protocols.
- **Disable Debug in Production**  
  • Ensure `NODE_ENV=production` and remove verbose error stacks.  
  • Protect or remove any dev-only endpoints (e.g., debug consoles).

## 7. Dependency Management

- **Secure Dependencies**  
  • Audit all npm packages (`npm audit`, `snyk`, `GitHub Dependabot`) regularly.  
  • Remove unused or high-risk libraries.  
  • Lock versions with `package-lock.json` and enforce in CI.
- **Supply-Chain Mitigation**  
  • Use reputation and maintenance activity as criteria when selecting new packages.  
  • Consider lockfile signing or yarn 2+ zero-install for additional integrity.

## 8. XBRL-Specific Considerations

- **Background Job Processing**  
  • Offload long conversions to a job queue (Inngest, BullMQ) and mark statuses in the database.  
  • Secure job queue endpoints with proper auth and input validation.
- **Taxonomy Database Integrity**  
  • Limit DB user privileges to only necessary operations (least privilege).  
  • Validate imported taxonomy records with checksums or digital signatures.
- **AI Microservice Integration**  
  • Secure FastAPI or Python agents behind authentication (mutual TLS or signed JWTs).  
  • Sanitize all data exchanged; enforce strict schema contracts on RPC or REST calls.

---
These guidelines establish defense-in-depth controls across authentication, input handling, data protection, API security, web hygiene, infrastructure, and dependency management. Integrate automated tests, CI/CD checks, and periodic security reviews to maintain the integrity of the xbrl-converter-suite as it evolves.