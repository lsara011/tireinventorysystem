# Tire Inventory System

A starter application for tracking tire inventory, purchase orders, and suppliers. The project currently includes a Next.js frontend shell with a responsive application header and a Python backend connection check for Supabase.

## Current Status

- Responsive desktop and mobile navigation
- Tailwind CSS styling with reusable UI primitives
- Placeholder inventory and add-tire views
- Supabase connection check for the `tires` table
- Production frontend build and lint checks

Inventory workflows, authenticated access, API routes, reports, and order and supplier pages are included.

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
npm run test:stress # Run the default PDF, HTTP, and API validation stress suites
```

The stress suites can also run independently from `Frontend/tireinventory`:

```bash
npm run stress:pdf        # Large tables, long notes, and PDF pagination
npm run stress:http       # Concurrent GET requests; defaults to the login page
npm run stress:validation # Invalid write requests that cannot mutate the database
```

Set `STRESS_URL`, `STRESS_REQUESTS`, `STRESS_CONCURRENCY`, and
`STRESS_EXPECTED_STATUS` to tune the HTTP suite for a specific read-only route.

## Backend Setup

Create and activate a Python virtual environment, then install the current backend dependencies:

```bash
cd Backend
python -m venv .venv
```

PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS or Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

Create `Backend/.env` with the following variables:

```dotenv
SUPABASE_URL=your-project-url
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key
SUPABASE_JWKS_URL=your-jwks-url
```

Start the backend API:

```bash
python -m uvicorn main:app --reload
```

The API is available at `http://127.0.0.1:8000`, with interactive documentation at `http://127.0.0.1:8000/docs`.

Run the database migrations in filename order using the Supabase SQL Editor:

1. `Backend/migrations/000_tire_inventory_schema.sql` adds stable tire IDs and enforces whole-number pricing.
2. `Backend/migrations/001_tire_deletion_history.sql` creates the inventory history table and transactional stock-removal function.
3. `Backend/migrations/002_suppliers_orders.sql` creates suppliers, purchase orders, line items, and the private invoice bucket.
4. `Backend/migrations/003_supplier_website.sql` adds supplier website links to an existing database.
5. `Backend/migrations/004_removal_financials.sql` records cost and revenue for inventory removals and reports.
6. `Backend/migrations/005_daily_sales.sql` creates daily customer sales and service line items.
7. `Backend/migrations/006_sale_payments.sql` adds deposits, balances, due dates, and payment history.
8. `Backend/migrations/007_performance_indexes.sql` indexes report dates, sales, payments, orders, and foreign-key joins.

> Keep `SUPABASE_SECRET_KEY` on the server only. Never expose it through frontend code or variables prefixed with `NEXT_PUBLIC_`.

## UI Components

Reusable components follow the shadcn-style layout under `Frontend/tireinventory/components/ui`. Shared class-name utilities live in `Frontend/tireinventory/lib/utils.ts`.

The global application header is defined in `Frontend/tireinventory/app/Header.tsx` and mounted from the root layout.

## Next Steps

1. Define the tire inventory schema and generated Supabase types.
2. Add FastAPI routes for inventory CRUD operations.
3. Connect the frontend inventory and add-tire views to the API.
4. Create staff users in Supabase Authentication; public account registration is intentionally disabled.
5. Add order and supplier routes linked from the header.
6. Add frontend and backend automated tests.
