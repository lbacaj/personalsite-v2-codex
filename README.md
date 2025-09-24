# Personal Hub

Self-hosted personal site and lightweight CRM built with Node.js, Express, and SQLite. The project follows the PRD for a "link-in-bio-but-better" site with analytics, email capture/imports, Mailgun sending, OpenAI-powered blurbs, and an ADMIN_TOKEN-protected dashboard.

🎥 Want the full walkthrough? Louie recorded an end-to-end build tutorial on YouTube: [Watch the video](https://youtu.be/sUfYbLlufms).

## Getting Started

1. Copy `.env.example` to `.env` and fill in the required secrets (ADMIN_TOKEN, OpenAI, Mailgun, etc.).
2. Install dependencies: `npm install`.
3. Run database migrations and seeds (coming soon).
4. Start the server: `npm run dev`.

The app listens on `PORT` (default 3000) and serves the public site along with an `/admin` dashboard.

## Scripts

- `npm run start` – start the production server.
- `npm run dev` – start the development server with `nodemon`.

## Project Structure

```
app.js
routes/
services/
utils/
db/
views/
public/
```

Each directory maps directly to a section of the PRD: routes handle HTTP endpoints, services wrap external integrations (GitHub, YouTube, Mailgun, OpenAI, etc.), and the SQLite schema is stored under `db/`.
