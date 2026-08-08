# School Management Software (MERN)

Bilingual (English / বাংলা) school management system built on the MERN stack.

## Modules
- **Core academics** — students, teachers, classes, sections, subjects, enrollment
- **Attendance & exams** — daily attendance, exams, marks, grades, report cards
- **Fees & payments** — fee structures, invoices, payments, dues
- **Timetable & notices** — class routine, notice board, announcements

## Extras
- **Photo uploads** — student/teacher photos (image upload API + avatars)
- **Dashboard charts** — students per class, attendance breakdown, monthly fee collection
- **PDF / print** — report cards, invoices, and result sheets print (browser "Save as PDF") via a print stylesheet
- **Bulk import** — students via CSV (template download + per-row error report)
- **Exam-wide result sheet** — whole-section tabulation with totals, GPA, and rank
- **Self-service** — students/parents see their own attendance, results, timetable, and invoices
- **Notice emails** — publishing a notice emails the targeted audience (SMTP via env; logs in dev)
- **Pluggable storage** — uploads to local disk or S3 (`STORAGE_DRIVER`)

## Roles
`admin` · `teacher` · `student` · `parent` · `accountant`

## Internationalization
- **UI** — `react-i18next` with English + বাংলা and a live language switcher.
- **Data** — content fields (names, notices, subject titles, etc.) are stored bilingually as `{ en, bn }` and rendered in the active language.

## Structure
```
Schoool Management Software/
├── server/   Express + Mongoose REST API (JWT auth, RBAC)
└── client/   React + Vite SPA (Tailwind, i18n)
```

## Getting started

### 1. Backend
```bash
cd server
cp .env.example .env      # then edit MONGO_URI / JWT_SECRET
npm install
npm run seed              # creates a demo admin + sample data
npm run dev               # http://localhost:5000
```

### 2. Frontend
```bash
cd client
npm install
npm run dev               # http://localhost:5173
```

### Demo login (after seeding)
- **Admin** — `admin@school.test` / `admin1234`
- Teacher / Student / Parent / Accountant logins are printed by the seed script.

## Database options

### Option A — MongoDB Atlas (recommended for real/persistent use)
1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. **Database Access** → add a user (username + password).
3. **Network Access** → allow your IP (or `0.0.0.0/0` for testing only).
4. **Connect → Drivers** → copy the connection string, e.g.
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/school_management?retryWrites=true&w=majority`
5. Put it in `server/.env` as `MONGO_URI=...` (URL-encode special characters in the password).
6. `npm run seed && npm run dev`.

### Option B — Local MongoDB
Install MongoDB Community Server and use `MONGO_URI=mongodb://127.0.0.1:27017/school_management`.

### Option C — In-memory (quick demo, data is wiped on restart)
No install needed — an ephemeral MongoDB is downloaded on first run:
```bash
cd server
npm run mongo:memory   # keep this running (starts MongoDB on port 27017)
```
Then in another terminal: `npm run seed && npm run dev`.

## Deployment

Three env values matter most in production: a strong `JWT_SECRET`, a real `MONGO_URI` (Atlas), and `CLIENT_ORIGIN` set to your public URL(s).

### Option 1 — Docker (single service, easiest)
The included `Dockerfile` builds the client and runs the API which **also serves the client** at `/`. `docker-compose.yml` adds MongoDB and a persistent uploads volume.

```bash
# from the project root
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build -d
# open http://localhost:5000
```
Then seed once (inside the running app container):
```bash
docker compose exec app npm run seed
```

### Option 2 — Single Node service (no Docker)
Build the client, then run the API with `SERVE_CLIENT=true` so it serves the built SPA:
```bash
npm run install:all
npm run build                 # builds client/dist
# set env: NODE_ENV=production, SERVE_CLIENT=true, MONGO_URI=..., JWT_SECRET=...
npm start                     # node server serving API + client on PORT (default 5000)
```

### Option 3 — Split hosting
Host `client/dist` on any static/CDN host and deploy `server/` separately (Render, Railway, Fly, a VM, …). Point the client at the API origin and set `CLIENT_ORIGIN` to the static site's URL.

### Production checklist
- Strong `JWT_SECRET`; production `MONGO_URI` (Atlas).
- `CLIENT_ORIGIN` = your public URL(s), comma-separated.
- Uploads persist under `server/uploads/` — mount a volume (compose does this) or set `STORAGE_DRIVER=s3` for object storage.
- Configure `SMTP_*` (email) and `SMS_PROVIDER` (SMS) if you want notice notifications actually delivered.

## NPM scripts (root)
- `npm run install:all` — install server + client deps
- `npm run build` — build the client
- `npm run seed` — seed demo data
- `npm run dev:server` / `npm run dev:client` — run each in dev
- `npm run docker:up` / `npm run docker:down` — Docker compose up/down

## Requirements
- Node.js 18+
- MongoDB 6+ (local, Atlas, or the bundled in-memory option above)
