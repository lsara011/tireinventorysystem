import copy
import logging
import os
import random
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from typing import Any, Literal, TypeVar
from urllib.parse import urlparse
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request, Response
from pydantic import (
    BaseModel,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)
from starlette.datastructures import UploadFile
from supabase import create_client

load_dotenv()

logger = logging.getLogger(__name__)

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SECRET_KEY")
publishable_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")

if not url or not key:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured")

supabase = create_client(url, key)
auth_supabase = create_client(url, publishable_key) if publishable_key else None
app = FastAPI()

ReadResult = TypeVar("ReadResult")
READ_CACHE_TTL_SECONDS = 5.0
READ_CACHE_MAX_ENTRIES = 500
read_cache: dict[str, tuple[float, Any]] = {}
read_cache_locks: dict[str, threading.Lock] = {}
read_cache_guard = threading.Lock()


def execute_supabase_read(
    operation: Callable[[], ReadResult],
    error_detail: str,
) -> ReadResult:
    for attempt in range(4):
        try:
            return operation()
        except Exception as exc:
            if attempt < 3:
                time.sleep(0.15 * (2**attempt) + random.uniform(0, 0.08))
                continue
            logger.exception("%s from Supabase", error_detail)
            raise HTTPException(status_code=503, detail=error_detail) from exc

    raise HTTPException(status_code=503, detail=error_detail)


def execute_cached_supabase_read(
    cache_key: str,
    operation: Callable[[], ReadResult],
    error_detail: str,
) -> ReadResult:
    now = time.monotonic()
    with read_cache_guard:
        cached = read_cache.get(cache_key)
        if cached and now - cached[0] < READ_CACHE_TTL_SECONDS:
            return copy.deepcopy(cached[1])
        cache_lock = read_cache_locks.setdefault(cache_key, threading.Lock())

    with cache_lock:
        now = time.monotonic()
        with read_cache_guard:
            cached = read_cache.get(cache_key)
            if cached and now - cached[0] < READ_CACHE_TTL_SECONDS:
                return copy.deepcopy(cached[1])

        value = execute_supabase_read(operation, error_detail)
        with read_cache_guard:
            if (
                cache_key not in read_cache
                and len(read_cache) >= READ_CACHE_MAX_ENTRIES
            ):
                oldest_key = min(
                    read_cache,
                    key=lambda key: read_cache[key][0],
                )
                read_cache.pop(oldest_key, None)
            read_cache[cache_key] = (time.monotonic(), copy.deepcopy(value))
        return value


def invalidate_supabase_read_cache() -> None:
    with read_cache_guard:
        read_cache.clear()


class TirePayload(BaseModel):
    tire_brand: str = Field(min_length=1, max_length=100)
    tire_quantity: int = Field(ge=0)
    tire_size: str = Field(min_length=1, max_length=50)
    tire_price: int = Field(ge=0)
    tire_location: str = Field(min_length=1, max_length=100)


class LoginPayload(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=200)


class RemoveTireStockPayload(BaseModel):
    quantity: int = Field(ge=1)
    unit_cost: int = Field(ge=0)
    unit_revenue: int = Field(ge=0)
    reason: Literal[
        "sold",
        "damaged",
        "returned_to_supplier",
        "inventory_correction",
        "other",
    ]
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def require_note_for_other(self):
        if self.reason == "other" and not (self.note or "").strip():
            raise ValueError("A note is required when the reason is Other")
        return self


class SupplierPayload(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    contact_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=254)
    website: str | None = Field(default=None, max_length=500)
    address: str | None = Field(default=None, max_length=300)
    account_number: str | None = Field(default=None, max_length=100)
    payment_terms: str | None = Field(default=None, max_length=100)
    brands: list[str] = Field(default_factory=list, max_length=50)
    lead_time_days: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool = True

    @field_validator("website")
    @classmethod
    def normalize_website(cls, value: str | None):
        if not value or not value.strip():
            return None

        website = value.strip()
        if "://" not in website:
            website = f"https://{website}"

        parsed = urlparse(website)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Website must be a valid HTTP or HTTPS address")
        return website


class OrderItemPayload(BaseModel):
    tire_brand: str = Field(min_length=1, max_length=100)
    tire_size: str = Field(min_length=1, max_length=50)
    quantity: int = Field(ge=1)
    unit_price: int = Field(ge=0)


class PurchaseOrderPayload(BaseModel):
    supplier_id: int
    invoice_number: str = Field(min_length=1, max_length=100)
    invoice_date: date
    total_amount: int = Field(ge=0)
    status: Literal[
        "draft",
        "ordered",
        "partially_received",
        "received",
        "cancelled",
    ] = "draft"
    notes: str | None = Field(default=None, max_length=1000)
    items: list[OrderItemPayload] = Field(default_factory=list, max_length=100)


class DailySaleItemPayload(BaseModel):
    category: Literal[
        "patch",
        "plug",
        "used_tire",
        "new_tire",
        "valve_stem",
        "balancing",
        "oil_change",
        "other",
    ]
    description: str | None = Field(default=None, max_length=300)
    tire_size: str | None = Field(default=None, max_length=50)
    valve_type: Literal["regular", "sensor"] | None = None
    quantity: int = Field(ge=1)
    unit_price: int = Field(ge=0)
    unit_cost: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def require_category_details(self):
        if self.category in {"used_tire", "new_tire"} and not (
            self.tire_size or ""
        ).strip():
            raise ValueError("Tire size is required for tire sales")
        if self.category == "valve_stem" and self.valve_type is None:
            raise ValueError("Valve type is required for valve stem sales")
        if self.category == "other" and not (self.description or "").strip():
            raise ValueError("A description is required for Other")
        return self


class DailySalePayload(BaseModel):
    sale_date: date
    receipt_number: str | None = Field(default=None, max_length=100)
    customer_name: str | None = Field(default=None, max_length=150)
    customer_phone: str | None = Field(default=None, max_length=50)
    customer_email: str | None = Field(default=None, max_length=254)
    vehicle: str | None = Field(default=None, max_length=150)
    payment_method: Literal["cash", "card", "check", "other"] = "cash"
    initial_payment: int = Field(ge=0)
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)
    items: list[DailySaleItemPayload] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def require_new_tire_customer_and_receipt(self):
        sale_total = sum(item.quantity * item.unit_price for item in self.items)
        if self.initial_payment > sale_total:
            raise ValueError("Initial payment cannot exceed the sale total")
        if any(item.category == "new_tire" for item in self.items):
            if not (self.receipt_number or "").strip():
                raise ValueError("A receipt number is required for new tire sales")
            if not (self.customer_name or "").strip():
                raise ValueError("A customer name is required for new tire sales")
        if self.initial_payment < sale_total:
            if not (self.customer_name or "").strip():
                raise ValueError("A customer name is required for a balance due")
            if self.due_date is None:
                raise ValueError("A due date is required for a balance due")
            if self.due_date < self.sale_date:
                raise ValueError("The due date cannot be before the sale date")
        return self


class DailySalePaymentPayload(BaseModel):
    payment_date: date
    amount: int = Field(ge=1)
    payment_method: Literal["cash", "card", "check", "other"]
    note: str | None = Field(default=None, max_length=500)


def create_auth_client():
    if auth_supabase is None:
        raise HTTPException(
            status_code=500,
            detail="Supabase authentication is not configured",
        )
    return auth_supabase


@app.post("/auth/login")
def login(payload: LoginPayload):
    try:
        result = create_auth_client().auth.sign_in_with_password(
            {
                "email": payload.email.strip().lower(),
                "password": payload.password,
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        ) from exc

    if not result.session or not result.user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "access_token": result.session.access_token,
        "expires_in": result.session.expires_in or 3600,
        "user": {
            "id": str(result.user.id),
            "email": result.user.email,
        },
    }


@app.get("/auth/verify")
def verify_session(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        result = create_auth_client().auth.get_user(token)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Session expired") from exc

    if not result.user:
        raise HTTPException(status_code=401, detail="Session expired")
    return {"id": str(result.user.id), "email": result.user.email}


@app.get("/tires")
def get_tires():
    return execute_cached_supabase_read(
        "tires",
        lambda: supabase.table("tires").select("*").execute().data,
        "Unable to load tires",
    )


@app.post("/tires", status_code=201)
def add_tire(payload: TirePayload):
    try:
        response = (
            supabase.table("tires")
            .insert(payload.model_dump())
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to add tire") from exc

    if not response.data:
        raise HTTPException(status_code=500, detail="Tire was not created")

    invalidate_supabase_read_cache()
    return response.data[0]


@app.put("/tires/{tire_id}")
def update_tire(tire_id: int, payload: TirePayload):
    try:
        response = (
            supabase.table("tires")
            .update(payload.model_dump())
            .eq("id", tire_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to update tire") from exc

    if not response.data:
        raise HTTPException(status_code=404, detail="Tire not found")

    invalidate_supabase_read_cache()
    return response.data[0]


@app.post("/tires/{tire_id}/remove-stock")
def remove_tire_stock(tire_id: int, payload: RemoveTireStockPayload):
    try:
        response = supabase.rpc(
            "remove_tire_stock_with_history",
            {
                "p_tire_id": tire_id,
                "p_quantity": payload.quantity,
                "p_reason": payload.reason,
                "p_unit_cost": payload.unit_cost,
                "p_unit_revenue": payload.unit_revenue,
                "p_note": (payload.note or "").strip() or None,
            },
        ).execute()
    except Exception as exc:
        message = str(exc).lower()
        if "tire not found" in message:
            raise HTTPException(status_code=404, detail="Tire not found") from exc
        if "quantity exceeds" in message:
            raise HTTPException(
                status_code=409,
                detail="Removal quantity exceeds available stock",
            ) from exc
        raise HTTPException(
            status_code=500,
            detail="Unable to remove tire stock",
        ) from exc

    invalidate_supabase_read_cache()
    return {"quantity_after": response.data}


@app.get("/tire-history")
def get_tire_history():
    return execute_cached_supabase_read(
        "tire-history",
        lambda: (
            supabase.table("tire_history")
            .select("*")
            .order("created_at", desc=True)
            .execute()
            .data
        ),
        "Unable to load tire history",
    )


@app.get("/sales")
def get_daily_sales(sale_date: date | None = None):
    target_date = sale_date.isoformat() if sale_date else None

    def load_sales():
        query_columns = (
            "id,sale_date,receipt_number,customer_name,customer_phone,"
            "customer_email,vehicle,payment_method,payment_status,due_date,"
            "notes,created_at,items:daily_sale_items(*),"
            "payments:daily_sale_payments(*)"
        )
        if not target_date:
            return (
                supabase.table("daily_sales")
                .select(query_columns)
                .order("created_at", desc=True)
                .execute()
                .data
            )

        def load_sales_for_date():
            return (
                supabase.table("daily_sales")
                .select(query_columns)
                .eq("sale_date", target_date)
                .order("created_at", desc=True)
                .execute()
                .data
            )

        def load_payment_sale_ids():
            return (
                supabase.table("daily_sale_payments")
                .select("sale_id")
                .eq("payment_date", target_date)
                .execute()
                .data
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            dated_sales_future = executor.submit(load_sales_for_date)
            payment_ids_future = executor.submit(load_payment_sale_ids)
            dated_sales = dated_sales_future.result()
            payment_rows = payment_ids_future.result()

        dated_sale_ids = {int(sale["id"]) for sale in dated_sales}
        additional_ids = sorted(
            {
                int(row["sale_id"])
                for row in payment_rows
                if int(row["sale_id"]) not in dated_sale_ids
            }
        )
        if additional_ids:
            additional_sales = (
                supabase.table("daily_sales")
                .select(query_columns)
                .in_("id", additional_ids)
                .execute()
                .data
            )
            dated_sales.extend(additional_sales)
            dated_sales.sort(key=lambda sale: sale["created_at"], reverse=True)

        return dated_sales

    sales = execute_cached_supabase_read(
        f"sales:{target_date or 'all'}",
        load_sales,
        "Unable to load daily sales",
    )
    for sale in sales:
        sale["payments"] = sorted(
            sale.get("payments") or [],
            key=lambda payment: (
                payment["payment_date"],
                payment["created_at"],
            ),
        )

    if target_date is None:
        return sales

    return [
        sale
        for sale in sales
        if sale["sale_date"] == target_date
        or any(
            payment["payment_date"] == target_date
            for payment in sale["payments"]
        )
    ]


@app.post("/sales", status_code=201)
def add_daily_sale(payload: DailySalePayload):
    sale_total = sum(item.quantity * item.unit_price for item in payload.items)
    sale_data = payload.model_dump(
        exclude={"items", "initial_payment"},
        mode="json",
    )
    sale_data["payment_status"] = (
        "paid"
        if payload.initial_payment == sale_total
        else "deposit"
        if payload.initial_payment > 0
        else "unpaid"
    )
    for field in (
        "receipt_number",
        "customer_name",
        "customer_phone",
        "customer_email",
        "vehicle",
        "notes",
    ):
        value = sale_data[field]
        sale_data[field] = value.strip() if value and value.strip() else None

    sale_id = None
    try:
        sale_response = supabase.table("daily_sales").insert(sale_data).execute()
        if not sale_response.data:
            raise RuntimeError("Sale was not created")

        sale = sale_response.data[0]
        sale_id = sale["id"]
        item_rows = []
        for item in payload.items:
            row = item.model_dump()
            row["sale_id"] = sale_id
            for field in ("description", "tire_size"):
                value = row[field]
                row[field] = value.strip() if value and value.strip() else None
            item_rows.append(row)

        items_response = (
            supabase.table("daily_sale_items").insert(item_rows).execute()
        )
        sale["items"] = items_response.data
        if payload.initial_payment > 0:
            payment_response = (
                supabase.table("daily_sale_payments")
                .insert(
                    {
                        "sale_id": sale_id,
                        "payment_date": payload.sale_date.isoformat(),
                        "amount": payload.initial_payment,
                        "payment_method": payload.payment_method,
                        "note": "Initial payment",
                    }
                )
                .execute()
            )
            sale["payments"] = payment_response.data
        else:
            sale["payments"] = []
        invalidate_supabase_read_cache()
        return sale
    except Exception as exc:
        if sale_id is not None:
            try:
                supabase.table("daily_sales").delete().eq("id", sale_id).execute()
            except Exception:
                pass

        message = str(exc).lower()
        if "duplicate" in message or "daily_sales_receipt_number_key" in message:
            raise HTTPException(
                status_code=409,
                detail="This receipt number has already been recorded",
            ) from exc
        raise HTTPException(
            status_code=500,
            detail="Unable to record daily sale",
        ) from exc


@app.post("/sales/{sale_id}/payments")
def add_daily_sale_payment(sale_id: int, payload: DailySalePaymentPayload):
    try:
        supabase.rpc(
            "record_daily_sale_payment",
            {
                "p_sale_id": sale_id,
                "p_payment_date": payload.payment_date.isoformat(),
                "p_amount": payload.amount,
                "p_payment_method": payload.payment_method,
                "p_note": (payload.note or "").strip() or None,
            },
        ).execute()

        response = (
            supabase.table("daily_sales")
            .select(
                "id,sale_date,receipt_number,customer_name,customer_phone,"
                "customer_email,vehicle,payment_method,payment_status,due_date,"
                "notes,created_at,items:daily_sale_items(*),"
                "payments:daily_sale_payments(*)"
            )
            .eq("id", sale_id)
            .single()
            .execute()
        )
        sale = response.data
        sale["payments"] = sorted(
            sale.get("payments") or [],
            key=lambda payment: (payment["payment_date"], payment["created_at"]),
        )
        invalidate_supabase_read_cache()
        return sale
    except Exception as exc:
        message = str(exc).lower()
        if "sale not found" in message:
            raise HTTPException(status_code=404, detail="Sale not found") from exc
        if "exceeds remaining balance" in message:
            raise HTTPException(
                status_code=409,
                detail="Payment cannot exceed the remaining balance",
            ) from exc
        if "cannot be added" in message:
            raise HTTPException(
                status_code=409,
                detail="Payments cannot be added to this sale",
            ) from exc
        raise HTTPException(
            status_code=500,
            detail="Unable to record payment",
        ) from exc


@app.get("/suppliers")
def get_suppliers():
    return execute_cached_supabase_read(
        "suppliers",
        lambda: (
            supabase.table("suppliers")
            .select("*")
            .order("name")
            .execute()
            .data
        ),
        "Unable to load suppliers",
    )


@app.post("/suppliers", status_code=201)
def add_supplier(payload: SupplierPayload):
    data = payload.model_dump()
    data["brands"] = [brand.strip() for brand in data["brands"] if brand.strip()]
    if data["website"] is None:
        data.pop("website")

    try:
        response = supabase.table("suppliers").insert(data).execute()
    except Exception as exc:
        if "website" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail=(
                    "Supplier websites are not enabled in the database. "
                    "Run migration 003_supplier_website.sql in Supabase."
                ),
            ) from exc
        raise HTTPException(
            status_code=500,
            detail="Unable to add supplier",
        ) from exc

    if not response.data:
        raise HTTPException(status_code=500, detail="Supplier was not created")

    invalidate_supabase_read_cache()
    return response.data[0]


@app.put("/suppliers/{supplier_id}")
def update_supplier(supplier_id: int, payload: SupplierPayload):
    data = payload.model_dump()
    data["brands"] = [brand.strip() for brand in data["brands"] if brand.strip()]
    if data["website"] is None:
        data.pop("website")

    try:
        response = (
            supabase.table("suppliers")
            .update(data)
            .eq("id", supplier_id)
            .execute()
        )
    except Exception as exc:
        if "website" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail=(
                    "Supplier websites are not enabled in the database. "
                    "Run migration 003_supplier_website.sql in Supabase."
                ),
            ) from exc
        raise HTTPException(
            status_code=500,
            detail="Unable to update supplier",
        ) from exc

    if not response.data:
        raise HTTPException(status_code=404, detail="Supplier not found")
    invalidate_supabase_read_cache()
    return response.data[0]


@app.delete("/suppliers/{supplier_id}", status_code=204)
def delete_supplier(supplier_id: int):
    try:
        orders = (
            supabase.table("purchase_orders")
            .select("id")
            .eq("supplier_id", supplier_id)
            .limit(1)
            .execute()
        )
        if orders.data:
            raise HTTPException(
                status_code=409,
                detail=(
                    "This supplier has orders and cannot be deleted. "
                    "Mark it inactive instead."
                ),
            )

        response = (
            supabase.table("suppliers")
            .delete()
            .eq("id", supplier_id)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to delete supplier",
        ) from exc

    if not response.data:
        raise HTTPException(status_code=404, detail="Supplier not found")
    invalidate_supabase_read_cache()
    return Response(status_code=204)


@app.get("/orders")
def get_orders():
    return execute_cached_supabase_read(
        "orders",
        lambda: (
            supabase.table("purchase_orders")
            .select(
                "id,supplier_id,invoice_number,invoice_date,total_amount,status,"
                "invoice_path,invoice_name,notes,created_at,"
                "supplier:suppliers(id,name),items:purchase_order_items(*)"
            )
            .order("created_at", desc=True)
            .execute()
            .data
        ),
        "Unable to load orders",
    )


@app.post("/orders", status_code=201)
async def add_order(request: Request):
    try:
        form = await request.form()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid order form") from exc

    metadata = form.get("metadata")
    if not isinstance(metadata, str):
        raise HTTPException(status_code=422, detail="Order details are required")

    try:
        payload = PurchaseOrderPayload.model_validate_json(metadata)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    invoice = form.get("invoice")
    invoice_path = None
    invoice_name = None
    invoice_type = None

    if isinstance(invoice, UploadFile) and invoice.filename:
        allowed_types = {
            "application/pdf": ".pdf",
            "image/png": ".png",
            "image/jpeg": ".jpg",
        }
        invoice_type = invoice.content_type or ""
        if invoice_type not in allowed_types:
            raise HTTPException(
                status_code=415,
                detail="Invoices must be PDF, PNG, or JPEG files",
            )

        contents = await invoice.read(10 * 1024 * 1024 + 1)
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Invoice files cannot exceed 10 MB",
            )

        invoice_name = Path(invoice.filename).name
        invoice_path = f"{uuid4()}{allowed_types[invoice_type]}"

        try:
            supabase.storage.from_("invoices").upload(
                path=invoice_path,
                file=contents,
                file_options={
                    "content-type": invoice_type,
                    "cache-control": "3600",
                    "upsert": "false",
                },
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail="Unable to upload invoice",
            ) from exc

    order_data = payload.model_dump(exclude={"items"}, mode="json")
    order_data.update(
        {
            "invoice_path": invoice_path,
            "invoice_name": invoice_name,
            "invoice_type": invoice_type,
        }
    )

    try:
        order_response = (
            supabase.table("purchase_orders")
            .insert(order_data)
            .execute()
        )
        if not order_response.data:
            raise RuntimeError("Order was not created")

        order = order_response.data[0]
        if payload.items:
            item_rows = [
                {**item.model_dump(), "order_id": order["id"]}
                for item in payload.items
            ]
            items_response = (
                supabase.table("purchase_order_items")
                .insert(item_rows)
                .execute()
            )
            order["items"] = items_response.data
        else:
            order["items"] = []

        supplier_response = (
            supabase.table("suppliers")
            .select("id,name")
            .eq("id", payload.supplier_id)
            .single()
            .execute()
        )
        order["supplier"] = supplier_response.data
        invalidate_supabase_read_cache()
        return order
    except Exception as exc:
        if invoice_path:
            try:
                supabase.storage.from_("invoices").remove([invoice_path])
            except Exception:
                pass

        message = str(exc).lower()
        if "duplicate" in message:
            raise HTTPException(
                status_code=409,
                detail="This invoice number already exists for the supplier",
            ) from exc
        raise HTTPException(status_code=500, detail="Unable to add order") from exc


@app.put("/orders/{order_id}")
async def update_order(order_id: int, request: Request):
    try:
        form = await request.form()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid order form") from exc

    metadata = form.get("metadata")
    if not isinstance(metadata, str):
        raise HTTPException(status_code=422, detail="Order details are required")

    try:
        payload = PurchaseOrderPayload.model_validate_json(metadata)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    try:
        existing_response = (
            supabase.table("purchase_orders")
            .select("invoice_path,invoice_name,invoice_type")
            .eq("id", order_id)
            .single()
            .execute()
        )
        existing = existing_response.data
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Order not found") from exc

    old_invoice_path = existing.get("invoice_path")
    invoice_path = old_invoice_path
    invoice_name = existing.get("invoice_name")
    invoice_type = existing.get("invoice_type")
    remove_invoice = form.get("remove_invoice") == "true"
    invoice = form.get("invoice")
    uploaded_path = None

    if isinstance(invoice, UploadFile) and invoice.filename:
        allowed_types = {
            "application/pdf": ".pdf",
            "image/png": ".png",
            "image/jpeg": ".jpg",
        }
        invoice_type = invoice.content_type or ""
        if invoice_type not in allowed_types:
            raise HTTPException(
                status_code=415,
                detail="Invoices must be PDF, PNG, or JPEG files",
            )

        contents = await invoice.read(10 * 1024 * 1024 + 1)
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Invoice files cannot exceed 10 MB",
            )

        invoice_name = Path(invoice.filename).name
        invoice_path = f"{uuid4()}{allowed_types[invoice_type]}"
        uploaded_path = invoice_path

        try:
            supabase.storage.from_("invoices").upload(
                path=invoice_path,
                file=contents,
                file_options={
                    "content-type": invoice_type,
                    "cache-control": "3600",
                    "upsert": "false",
                },
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail="Unable to upload replacement invoice",
            ) from exc
    elif remove_invoice:
        invoice_path = None
        invoice_name = None
        invoice_type = None

    order_data = payload.model_dump(exclude={"items"}, mode="json")
    order_data.update(
        {
            "invoice_path": invoice_path,
            "invoice_name": invoice_name,
            "invoice_type": invoice_type,
        }
    )

    try:
        order_response = (
            supabase.table("purchase_orders")
            .update(order_data)
            .eq("id", order_id)
            .execute()
        )
        if not order_response.data:
            raise HTTPException(status_code=404, detail="Order not found")

        supabase.table("purchase_order_items").delete().eq(
            "order_id", order_id
        ).execute()
        if payload.items:
            item_rows = [
                {**item.model_dump(), "order_id": order_id}
                for item in payload.items
            ]
            items_response = (
                supabase.table("purchase_order_items")
                .insert(item_rows)
                .execute()
            )
            items = items_response.data
        else:
            items = []

        supplier_response = (
            supabase.table("suppliers")
            .select("id,name")
            .eq("id", payload.supplier_id)
            .single()
            .execute()
        )
        order = order_response.data[0]
        order["items"] = items
        order["supplier"] = supplier_response.data

        if old_invoice_path and old_invoice_path != invoice_path:
            try:
                supabase.storage.from_("invoices").remove([old_invoice_path])
            except Exception:
                pass

        invalidate_supabase_read_cache()
        return order
    except HTTPException:
        raise
    except Exception as exc:
        if uploaded_path:
            try:
                supabase.storage.from_("invoices").remove([uploaded_path])
            except Exception:
                pass

        message = str(exc).lower()
        if "duplicate" in message:
            raise HTTPException(
                status_code=409,
                detail="This invoice number already exists for the supplier",
            ) from exc
        raise HTTPException(status_code=500, detail="Unable to update order") from exc


@app.delete("/orders/{order_id}", status_code=204)
def delete_order(order_id: int):
    try:
        existing_response = (
            supabase.table("purchase_orders")
            .select("invoice_path")
            .eq("id", order_id)
            .single()
            .execute()
        )
        existing = existing_response.data
        supabase.table("purchase_orders").delete().eq("id", order_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Order not found") from exc

    if existing and existing.get("invoice_path"):
        try:
            supabase.storage.from_("invoices").remove(
                [existing["invoice_path"]]
            )
        except Exception:
            pass

    invalidate_supabase_read_cache()
    return Response(status_code=204)


@app.get("/orders/{order_id}/invoice-url")
def get_order_invoice_url(order_id: int):
    try:
        response = (
            supabase.table("purchase_orders")
            .select("invoice_path,invoice_name")
            .eq("id", order_id)
            .single()
            .execute()
        )
        order = response.data
        if not order or not order.get("invoice_path"):
            raise HTTPException(status_code=404, detail="Invoice not found")

        signed = (
            supabase.storage.from_("invoices")
            .create_signed_url(
                order["invoice_path"],
                300,
                {"download": order.get("invoice_name") or True},
            )
        )
        signed_url = signed.get("signedURL") or signed.get("signed_url")
        if not signed_url:
            raise RuntimeError("Signed URL was not created")
        return {"url": signed_url}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to open invoice",
        ) from exc
