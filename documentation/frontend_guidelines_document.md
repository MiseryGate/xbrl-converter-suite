# Frontend Guideline Document

This document outlines the architecture, design principles, and technologies used in the xbrl-converter-suite frontend. It is written in everyday language to ensure anyone can understand the setup and maintain or extend it confidently.

## 1. Frontend Architecture

### 1.1 Overview
- **Framework**: Next.js 15 (App Router) provides file-based routing, server and client components, and built-in optimizations.
- **Library**: React powers interactive UI components.
- **UI Components**: `shadcn/ui` offers a pre-built, accessible set of components (buttons, forms, tables, modals).
- **Styling**: Tailwind CSS (utility-first) drives styling and theming, with `next-themes` for dark/light mode.

### 1.2 Scalability & Maintainability
- **Server & Client Components**: Heavy data fetching and processing occur on the server (via Server Components and API Routes), reducing client bundle size.
- **Modular Folder Structure**: Clear separation of `/app` (pages/layouts), `/components`, `/lib`, `/db`, and `/services` lets teams work in parallel.
- **TypeScript Everywhere**: Strict types guard against runtime errors, especially important for financial data.

### 1.3 Performance
- **Automatic Code Splitting**: Next.js splits bundles by route.
- **Image & Asset Optimization**: `next/image` handles responsive images and lazy loading.
- **Built-in Caching**: Next.js caching strategies (ISR, streaming) and Tailwind’s purging minimize CSS size.

## 2. Design Principles

### 2.1 Usability
- **Intuitive Layouts**: Dashboard pages follow predictable patterns—upload at top, status list below, analytics side panel.
- **Clear Feedback**: Progress indicators and toast notifications inform users about conversion status.

### 2.2 Accessibility
- **ARIA Attributes**: All interactive components include proper roles and labels.
- **Keyboard Navigation**: Focus states and skip links ensure users can reach every feature without a mouse.
- **Color Contrast**: Meets WCAG AA standards in both light and dark themes.

### 2.3 Responsiveness
- **Mobile-First**: Tailwind’s responsive utilities ensure the UI adapts from phones to large desktops.
- **Fluid Layouts**: Grids and flex layouts adjust content gracefully across breakpoints.

## 3. Styling and Theming

### 3.1 Styling Approach
- **Utility-First CSS**: Tailwind CSS favors small, composable classes over custom stylesheets.
- **No Custom Preprocessors**: We rely on Tailwind’s JIT compiler rather than SASS or LESS.

### 3.2 Theming
- **Light & Dark Mode**: Configured with `next-themes`, toggled by a theme switcher in the header.
- **Design Tokens**: Defined in `tailwind.config.js` for colors, spacing, and typography.

### 3.3 Visual Style
- **Design Style**: Modern & flat UI with subtle glassmorphism on modals and overlays.
- **Font**: Inter (sans-serif) for readability and a professional look.

### 3.4 Color Palette
Light Mode:
  • Primary: #1E3A8A (blue-800)  
  • Secondary: #10B981 (emerald-500)  
  • Accent: #F59E0B (amber-500)  
  • Background: #F9FAFB (gray-50)  
  • Surface (cards/panels): #FFFFFF  
  • Text: #111827 (gray-900), Secondary text: #6B7280 (gray-500)

Dark Mode:
  • Background: #111827  
  • Surface: #1F2937  
  • Text: #E5E7EB (gray-200), Secondary text: #9CA3AF (gray-400)

## 4. Component Structure

### 4.1 Organization
- **/components/ui**: Generic UI building blocks (Button, Input, Modal).
- **/components/dashboard**: Domain-specific pieces (FileUploadZone, ConversionHistoryTable, AnalyticsChart).

### 4.2 Reusability
- **Atomic Components**: Small, focused components compose into larger features.
- **Props & Slots**: Controlled via well-typed props and children slots for flexibility.

### 4.3 Benefits
- **Maintainability**: Changes in one component automatically propagate wherever it’s used.
- **Onboarding**: New developers find and understand components quickly thanks to consistent naming and structure.

## 5. State Management

### 5.1 Local State
- **React State Hooks**: `useState` and `useReducer` for ephemeral UI state (form fields, toggles).

### 5.2 Shared State
- **Context API**: Session data and theme preference managed in React contexts.
- **Server Components**: Fetch session and user data on the server to avoid unnecessary client-side state.

### 5.3 Data Fetching & Caching
- **Built-in Data Fetching**: Next.js Server Components and API Routes deliver data directly.
- **Optional**: SWR or React Query can be added for client-side caching and polling (e.g., conversion job status).

## 6. Routing and Navigation

### 6.1 Routing
- **App Router**: Folder-based routing in `/app`. Nested layouts (`layout.js`) provide shared UI (nav bars, side panels).
- **Dynamic Routes**: `[id]` patterns for conversion detail pages and analytics overviews.

### 6.2 Navigation
- **next/link**: Client-side transitions with `Link` component.
- **Active Link Styles**: Tailwind `active:` and `aria-current` for highlighting the current page.

## 7. Performance Optimization

### 7.1 Lazy Loading
- **Dynamic Imports**: `next/dynamic` to load heavy charting libraries only when needed.
- **Image Lazy Loading**: `next/image` defaults to lazy loading.

### 7.2 Code Splitting
- **Route-based**: Each page bundle is isolated. Shared libraries are deduped.

### 7.3 Asset Optimization
- **Tailwind Purge**: Removes unused CSS classes in production builds.
- **Compression & Caching**: Vercel or CDN caches static assets and gzips files.

## 8. Testing and Quality Assurance

### 8.1 Unit & Integration Tests
- **Jest**: For testing React components, utility functions, and data transformations.
- **React Testing Library**: Renders components in isolation and verifies behavior over implementation details.

### 8.2 End-to-End Tests
- **Cypress**: Simulates user flows—sign up, file upload, job status polling, XBRL download, and analytics exploration.

### 8.3 Linting & Formatting
- **ESLint**: Enforces code quality and catches potential bugs.
- **Prettier**: Automates code formatting for consistency.
- **TypeScript**: Strict mode ensures type safety across the codebase.

## 9. Conclusion and Overall Frontend Summary

This guideline captures the core of the xbrl-converter-suite frontend:
- A **Next.js 15** architecture leveraging server components for performance and security.  
- **Utility-first styling** with Tailwind CSS and a modern, flat design enriched by `shadcn/ui` components.  
- **Component-driven** structure for maintainability and rapid feature development.  
- **Built-in state and data fetching** complemented by optional SWR/React Query.  
- **Accessibility, responsiveness, and usability** baked in from day one.  
- **Robust testing** and **CI/CD readiness** for dependable releases.

Together, these practices ensure a scalable, high-performance, and user-friendly frontend that meets the demands of a sophisticated XBRL conversion and analytics platform.