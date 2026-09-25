# Tire Inventory System

A starter application for tracking tire inventory, purchase orders, and suppliers. The project currently includes a Next.js frontend shell with a responsive application header and a Python backend connection check for Supabase.

## Current Status

- Responsive desktop and mobile navigation
- Tailwind CSS styling with reusable UI primitives
- Placeholder inventory and add-tire views
- Supabase connection check for the `tires` table
- Production frontend build and lint checks

Inventory workflows, authentication, API routes, and order and supplier pages are still under development.

## Tech Stack

### Frontend

- Next.js 16 with the App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI primitives
- Lucide icons

### Backend

- Python
- FastAPI (API routes not yet implemented)
- Supabase
- python-dotenv

## Project Structure

```text
Tire Inventory System/
|-- Backend/
|   |-- .env             # Local Supabase credentials (not committed)
|   `-- main.py          # Supabase connection check
|-- Frontend/
|   `-- tireinventory/
|       |-- app/         # Next.js routes, layout, and application UI
|       |-- components/  # Reusable UI components
|       |-- lib/         # Shared utilities
|       `-- public/      # Static assets
`-- README.md
```

## Prerequisites

- Node.js 22.13 or newer LTS release
- npm
- Python 3.10 or newer
- A Supabase project with a `tires` table

Node.js 23 is not recommended because one of the lint dependencies does not support that release line.

## Frontend Setup

From the repository root:

```bash
cd Frontend/tireinventory
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If that port is occupied, Next.js will report the alternate port in the terminal.

Useful commands:

```bash
npm run dev      # Start the development server
npm run lint     # Run ESLint
npm run build    # Create and validate a production build
npm run start    # Serve the production build
```

## Backend Setup

Create and activate a Python virtual environment, then install the current backend dependencies:

```bash
cd Backend
python -m venv .venv
```

PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
pip install fastapi supabase python-dotenv
```

macOS or Linux:

```bash
source .venv/bin/activate
pip install fastapi supabase python-dotenv
```

Create `Backend/.env` with the following variables:

```dotenv
SUPABASE_URL=your-project-url
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key
SUPABASE_JWKS_URL=your-jwks-url
```

Run the connection check:

```bash
python main.py
```

The script queries the `tire_brand` column from the `tires` table and reports whether the connection succeeded.

> Keep `SUPABASE_SECRET_KEY` on the server only. Never expose it through frontend code or variables prefixed with `NEXT_PUBLIC_`.

## UI Components

Reusable components follow the shadcn-style layout under `Frontend/tireinventory/components/ui`. Shared class-name utilities live in `Frontend/tireinventory/lib/utils.ts`.

The global application header is defined in `Frontend/tireinventory/app/Header.tsx` and mounted from the root layout.

## Next Steps

1. Define the tire inventory schema and generated Supabase types.
2. Add FastAPI routes for inventory CRUD operations.
3. Connect the frontend inventory and add-tire views to the API.
4. Implement authentication and protect administrative actions.
5. Add order and supplier routes linked from the header.
6. Add frontend and backend automated tests.
