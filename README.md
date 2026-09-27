# Tire Inventory System

A full-stack inventory and daily sales application for a tire shop. Staff can manage tire stock, record services and payments, organize suppliers and purchase orders, upload invoices, and export operational reports.

## Features

### Inventory

- Search, add, edit, and remove tire inventory.
- Track brand, size, quantity, price, and storage location.
- Prevent removing more tires than are currently available.
- Record whether stock was sold, damaged, returned to a supplier, corrected, or removed for another reason.
- Preserve removal quantity, cost, revenue, notes, and history instead of losing the record.

### Daily Sales

- Record patches, plugs, used tires, new tires, valve stems, balancing, oil changes, and other work.
- Store tire size, receipt details, customer information, vehicle information, payment method, cost, and sale price.
- Accept full payments or down payments, including due dates and later payment entries.
- Show sales booked, cash collected, outstanding balances, costs, and gross profit by day.
- Export the selected day's sales to PDF.

### Suppliers And Orders

- Create, edit, and delete supplier records.
- Store supplier contact information, website links, brands, lead times, and notes.
- Create, edit, and delete purchase orders and their line items.
- Upload PDF, PNG, or JPEG invoices up to 10 MB to a private Supabase Storage bucket.
- Open stored invoices through short-lived signed URLs.

### Reports

- Review daily, monthly, or yearly activity, with daily selected by default.
- Filter inventory removals by reason.
- Keep sales revenue, gross profit, damage loss, and current inventory value separate.
- Export reports as CSV or PDF.
- Use responsive tables with horizontal scrolling on small screens.

### Access And Performance

- Authenticate staff with Supabase Auth. Public account registration is disabled.
- Protect application pages and API requests with verified sessions.
- Cache and coalesce short-lived reads while invalidating cached data after writes.
- Retry transient Supabase read failures and index common filters, joins, and sort columns.
- Provide responsive desktop and mobile navigation.

Money values are stored as whole-dollar integers. Decimal prices, costs, and payments are intentionally not accepted.

## Tech Stack

### Frontend

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS 4
- Radix UI primitives and Lucide icons
- jsPDF and jspdf-autotable

### Backend

- Python 3.10+
- FastAPI and Uvicorn
- Supabase Database, Authentication, and Storage
- python-dotenv and python-multipart

## Project Structure

```text
Tire Inventory System/
|-- Backend/
|   |-- migrations/           # Supabase SQL migrations
|   |-- .env                  # Server-only credentials (not committed)
|   |-- main.py               # FastAPI routes and application services
|   `-- requirements.txt
|-- Frontend/
|   `-- tireinventory/
|       |-- app/              # Pages, API proxy routes, and feature UI
|       |-- components/ui/    # Reusable interface components
|       |-- lib/              # Shared utilities and PDF generation
|       |-- scripts/          # HTTP, validation, and PDF stress suites
|       |-- proxy.ts          # Authentication route protection
|       `-- package.json
`-- README.md
```

## Prerequisites

- Node.js 22.13 or a newer Node.js 22 LTS release
- npm
- Python 3.10 or newer
- A Supabase project

Node.js 23 is not recommended because it is outside the supported release range of one of the lint dependencies.

## Database Setup

Open the Supabase SQL Editor and run every file in `Backend/migrations` in filename order:

1. `000_tire_inventory_schema.sql` creates the tire inventory schema, stable IDs, and whole-number pricing constraints.
2. `001_tire_deletion_history.sql` creates inventory history and the transactional stock-removal function.
3. `002_suppliers_orders.sql` creates suppliers, orders, line items, and the private invoice bucket.
4. `003_supplier_website.sql` adds supplier website links.
5. `004_removal_financials.sql` adds cost and revenue fields to removal history.
6. `005_daily_sales.sql` creates daily sales and service line items.
7. `006_sale_payments.sql` adds deposits, balances, due dates, and payment history.
8. `007_performance_indexes.sql` adds indexes for report dates, sales, payments, orders, and foreign-key joins.

Run new migrations whenever the repository adds another numbered SQL file. Do not delete applied migrations; they document the database structure and are needed when setting up another environment.

Create each staff account in **Supabase Dashboard > Authentication > Users**. The application provides a login page but intentionally does not provide public registration.

## Backend Setup

From the repository root:

```bash
cd Backend
python -m venv .venv
```

Activate the environment and install dependencies.

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

Create `Backend/.env`:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key
SUPABASE_JWKS_URL=https://your-project.supabase.co/auth/v1/.well-known/jwks.json
```

Start the API from the `Backend` directory:

```bash
python -m uvicorn main:app --reload
```

The API runs at `http://127.0.0.1:8000`. Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

Keep `SUPABASE_SECRET_KEY` on the backend only. Never place it in frontend code or in a variable prefixed with `NEXT_PUBLIC_`.

## Frontend Setup

In a second terminal, from the repository root:

```bash
cd Frontend/tireinventory
npm install
```

Create `Frontend/tireinventory/.env.local`:

```dotenv
API_URL=http://127.0.0.1:8000
```

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000` and sign in with a staff account created in Supabase Auth.

## Local Network Testing

To open the application from a phone or another device on the same network, start Next.js on all network interfaces:

```bash
npm run dev -- --hostname 0.0.0.0
```

Open `http://<computer-ip>:3000` on the other device. Keep the backend running on the computer and leave `API_URL=http://127.0.0.1:8000`, because Next.js sends backend requests from the server. If the page does not connect, allow Node.js through the computer's firewall for private networks and confirm both devices are on the same network.

## Routes

| Route | Purpose |
| --- | --- |
| `/login` | Staff sign-in |
| `/` | Tire inventory and removal history |
| `/sales` | Daily services, tire sales, deposits, and payments |
| `/orders` | Purchase orders and invoice files |
| `/suppliers` | Supplier directory |
| `/reports` | Daily, monthly, and yearly financial reports |

## Checks And Stress Tests

Run these commands from `Frontend/tireinventory`:

```bash
npm run lint              # Run ESLint
npm run build             # Create and validate a production build
npm run stress:pdf        # Exercise large PDF tables and pagination
npm run stress:http       # Send concurrent read requests
npm run stress:validation # Send invalid writes that must not mutate data
npm run test:stress       # Run all three stress suites
```

The HTTP suite expects the frontend to be running, and the validation suite expects the backend to be running. The default HTTP target is `http://127.0.0.1:3000/login`.

Optional environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `STRESS_URL` | HTTP target | `http://127.0.0.1:3000/login` |
| `STRESS_REQUESTS` | Number of HTTP requests | `1000` |
| `STRESS_CONCURRENCY` | Concurrent workers | `50` for HTTP |
| `STRESS_EXPECTED_STATUS` | Accepted comma-separated statuses | `200` |
| `STRESS_COOKIE` | Optional authenticated cookie header | unset |
| `STRESS_API_URL` | Backend validation target | `http://127.0.0.1:8000` |
| `STRESS_VALIDATION_REQUESTS` | Invalid validation requests | `1200` |
| `PDF_STRESS_ROWS` | Rows in the large PDF test | `12000` |

PowerShell example:

```powershell
$env:STRESS_REQUESTS = "5000"
$env:STRESS_CONCURRENCY = "100"
npm run stress:http
```

## Production Build

Build and serve the frontend:

```bash
cd Frontend/tireinventory
npm run build
npm run start
```

Run FastAPI without `--reload` in production and place both services behind HTTPS. Before deployment, configure managed secrets, database backups, logging, and the required firewall or reverse-proxy rules.

## Current Status

The main inventory, sales, payment, supplier, order, invoice, authentication, reporting, and export workflows are implemented. The next useful additions are automated browser and API integration tests, role-based permissions, and a documented production deployment process.
