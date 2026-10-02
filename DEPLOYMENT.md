# Publish Thon Hub on GitHub and Vercel

Upload all files and folders inside your saved Thon Hub project folder. `index.html` contains the complete browser interface; authentication, data and email use the included server routes.

1. Create or open your GitHub repository. GitHub accepts up to 100 files per browser upload, so use two uploads. First click **Add file → Upload files**, drag in the **components** folder from inside your saved project (62 files), and commit. Repeat **Add file → Upload files**, drag in all remaining files and folders from inside the project (68 files), and commit. Keep the folder structure: `package.json` and `app`, `lib`, `public`, `components`, `drizzle`, and `scripts` must be at the repository root. Upload both batches before deploying. On a Mac, press Command + Shift + . to show `.gitignore` and `.env.example` if Finder hides them.
2. Create a Turso database and copy its database URL and auth token. Turso keeps events, accounts, registrations, payment reviews and the email queue outside Vercel's temporary filesystem.
3. In Vercel, select **Add New → Project → Import Git Repository** and select your repository. Choose **Next.js** as the framework, leave **Root Directory** blank when `package.json` is at the repository root, set the build command to `npm run build`, and turn off the **Output Directory Override**. If you uploaded the project inside another folder, set Root Directory to that folder instead.
4. Add the environment variables listed below. Use your existing Resend key. It is deliberately not embedded in the HTML or source.
5. Deploy. The build initializes the database schema and produces the website and its backend.
6. In the Vercel project's **Storage** area, create a **private Blob** store and connect it to the project. Vercel supplies `BLOB_READ_WRITE_TOKEN`; redeploy after connecting it. This preserves the 10 MB event-image and PDF uploads.
7. Sign in using the email configured privately as `ADMIN_EMAIL`, confirm the email link, and open **Admin workspace**. Other verified email accounts can register for events but cannot access administration or send mail.

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | Your Turso `libsql://...` database URL |
| `TURSO_AUTH_TOKEN` | Your Turso database token |
| `ADMIN_EMAIL` | Your administrator's email address, configured privately in Vercel |
| `EMAIL_FROM` | `Thon Hub <events@thonhub.com>` |
| `RESEND_API_KEY` | Your existing Resend API key, saved only in Vercel environment settings |
| `BLOB_READ_WRITE_TOKEN` | Added when you connect the private Blob store |
| `APP_URL` | Your site's public HTTPS URL. You may omit it on Vercel to use `VERCEL_PROJECT_PRODUCTION_URL` automatically. |

## Attach thonhub.com to the website

In Vercel, open **Settings → Domains → Add Domain**, enter `thonhub.com`, and add the exact DNS records Vercel displays. The website's DNS entries and Resend's email entries have different purposes; keep your verified Resend TXT, CNAME and mail records. Once the website domain is active, set `APP_URL=https://thonhub.com` and redeploy so sign-in emails point there.

## Next updates

Commit and push source changes to GitHub. Vercel builds and deploys the linked branch automatically. Keep production environment secrets in Vercel; `.env` files and local databases are ignored by Git.

Official references: [Vercel GitHub deployment](https://vercel.com/docs/deployments/git/vercel-for-github), [Turso TypeScript SDK](https://docs.turso.tech/sdk/ts/reference), [Vercel Blob client uploads](https://vercel.com/docs/vercel-blob/client-upload), [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction).

## Check the deployment

After deployment, visit `https://thonhub.com/api/hub`. A configured deployment returns a JSON object containing `events`, `user`, and `admin`. A `404` indicates the backend routes were not deployed; check that `app/api` is uploaded and the project is built as Next.js. A `503` indicates the backend is present but cannot load its database; check the Turso settings and build logs.
