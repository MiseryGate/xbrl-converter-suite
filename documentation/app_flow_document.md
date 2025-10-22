# App Flow Document

## Onboarding and Sign-In/Sign-Up

When a new user first encounters the xbrl-converter-suite application, they typically arrive on the public landing page by typing the app’s URL or clicking a shared link. This landing page briefly explains the platform’s purpose and provides clear buttons for signing up or signing in. To create an account, the user clicks the Sign Up button and is taken to a form where they enter their email address, choose a secure password, and confirm their details. After submitting, they receive a verification email with a link that activates their account.

Once their email is verified, the user can log in by entering their credentials on the Sign In page. If they ever forget their password, a “Forgot Password?” link on the sign-in screen leads them to a recovery form. They provide their email address, receive a password reset link, and follow it to choose a new password. At any point after signing in, users can sign out through the profile menu in the header.

## Main Dashboard or Home Page

Upon successful login, the user lands on the main dashboard located at `/app/dashboard`. The screen is divided into a sidebar on the left and the content area on the right. The sidebar displays navigation links labeled Convert, History, Analytics, and Settings. The header at the top shows the user’s name, a theme toggle for light and dark modes, and an avatar menu for signing out or accessing account preferences.

The default content area welcomes the user with an overview of their recent activity. It displays a summary widget showing the number of conversions completed this week, the status of any in-progress conversions, and a button that takes users directly to the Convert section. From this dashboard view, the user can click any sidebar option to move to that part of the application.

## Detailed Feature Flows and Page Transitions

When the user clicks Convert in the sidebar, they arrive at `/app/dashboard/convert`. This page shows a large file dropzone and a button to browse local files. The user drags a CSV, Excel, PDF, or XBRL file into the dropzone or selects it manually. Once a file is chosen, they press the Start Conversion button. Behind the scenes, the app calls the `/api/convert` route, which saves the file metadata to the database, invokes the correct parser from the `/lib/parsers` directory, and transforms the parsed data into a canonical model. If the file is a PDF, an external AI microservice may be called for text extraction. Once parsing is complete, the service uses the taxonomy database to map values, generates the XBRL file via the `/lib/xbrl-generator.ts` module, and stores the result in blob storage. The database record is then updated with the conversion status.

As soon as the client receives confirmation that the job has been queued, the page displays a conversion ID and a status indicator set to “In Progress.” The user remains on the Convert page but sees a link labeled View History that takes them to `/app/dashboard/history`.

On the History page, the user sees a table of past conversions, including file names, submission dates, and result statuses. Each row has a Download link to retrieve the generated XBRL file. If a conversion failed, an error icon appears and the user can click a Details button to view the failure reason.

When the user clicks Analytics in the sidebar, they navigate to `/app/dashboard/analytics`. This page retrieves aggregated data from API routes under `/api/analytics` and renders charts and tables using the shadcn/ui chart components. The user can filter analytics by date range, report type, or taxonomy category. Selecting a chart segment triggers a drill-down view that overlays detailed data for the chosen metric.

## Settings and Account Management

To update personal information, the user clicks Settings in the sidebar and lands on `/app/dashboard/settings`. Here they can edit their name, email, and profile picture. A separate tab within settings allows them to configure notification preferences, choosing whether to receive emails for completed conversions or system updates. If the platform offers subscription tiers, a Billing section shows the current plan, usage statistics, payment method, and an Upgrade button. Once changes are saved, a confirmation message appears and the user can click Return to Dashboard to go back to the main flow.

## Error States and Alternate Paths

If the user uploads an unsupported file type, the dropzone immediately shows a red banner with the message “File type not supported.” The user can then select a different file format. During conversion, if the network connection is lost, a notification pops up at the top of the screen stating “Connection lost, retrying…” and the app attempts to reconnect automatically. Should the conversion API respond with a server error, the History page displays the failed job with an error icon and a Details link. Clicking Details opens a modal with the error message returned by the server and suggestions for resolution, such as checking file formatting.

If the user tries to access a protected route like Convert or Analytics without being signed in, they are redirected to the Sign In page. After successfully signing in, they return to the page they originally requested.

## Conclusion and Overall App Journey

From the moment a new user arrives at the landing page, they can easily sign up, verify their email, and gain access to a secure dashboard. Once logged in, the user flows naturally from the dashboard overview to uploading financial documents for conversion, monitoring progress in the history section, and exploring analytical visualizations. Account and notification settings remain accessible at all times, and robust error handling ensures that invalid inputs or network interruptions are clearly communicated. Together, these pages and transitions create a seamless experience from initial sign-up through daily usage, enabling users to convert documents to XBRL and derive financial insights with minimal friction.