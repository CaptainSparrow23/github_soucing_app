This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Microsoft Auth + Send Mail

This app can sign in with Microsoft and send emails as the signed-in user via Microsoft Graph.

1. Create an Azure App Registration with **Web** platform support.
2. Add a redirect URI that matches `MICROSOFT_REDIRECT_URI` (example: `http://localhost:3000/api/auth/microsoft/callback`).
3. Add delegated permissions for `Mail.Send`, `User.Read`, and `offline_access`, then grant admin consent.
4. Create a client secret and store it locally.

Create a `.env.local` file with:

```
MICROSOFT_TENANT_ID=common
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/microsoft/callback
```

Legacy env vars (`OUTLOOK_*` and `MS_REDIRECT_URI`) are also supported but the `MICROSOFT_*` values take precedence.

After signing in, you can send emails using the form on the home page.

## LinkedIn resolve (optional)

The results tables can optionally resolve each person to a specific LinkedIn profile URL (instead of just a search link) using Google Programmable Search (Custom Search JSON API).

1. Create a Programmable Search Engine and copy its **Search engine ID (cx)**.
2. Configure the engine to search the web (or restrict it), and add a site restriction like `linkedin.com/in`.
3. In Google Cloud Console, enable **Custom Search API** and create an **API key**.
4. Set these env vars (in `.env.local` or `.env`):

```
GOOGLE_CSE_API_KEY=your-google-api-key
GOOGLE_CSE_CX=your-search-engine-id
```

In the UI, click **Resolve LinkedIn** above a results table. The resolver only runs for names that look like exactly `FirstName LastName`.

To hard-cap spend, you can also set a simple app-side limit (per running server instance):

```
LINKEDIN_RESOLVE_DAILY_LIMIT=200
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
