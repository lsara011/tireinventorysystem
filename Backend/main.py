import logging
import os
import time
from datetime import date
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
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

if not url or not key:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured")

supabase = create_client(url, key)
app = FastAPI()


class TirePayload(BaseModel):
    tire_brand: str = Field(min_length=1, max_length=100)
    tire_quantity: int = Field(ge=0)
    tire_size: str = Field(min_length=1, max_length=50)
    tire_price: int = Field(ge=0)
    tire_location: str = Field(min_length=1, max_length=100)


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


@app.get("/tires")
def get_tires():
    try:
        response = supabase.table("tires").select("*").execute()
        return response.data
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to load tires",
        ) from exc


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

    return {"quantity_after": response.data}


@app.get("/tire-history")
def get_tire_history():
    try:
        response = (
            supabase.table("tire_history")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        return response.data
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to load tire history",
        ) from exc


@app.get("/suppliers")
def get_suppliers():
    for attempt in range(3):
        try:
            response = (
                supabase.table("suppliers")
                .select("*")
                .order("name")
                .execute()
            )
            return response.data
        except Exception as exc:
            if attempt < 2:
                time.sleep(0.25 * (attempt + 1))
                continue
            logger.exception("Unable to load suppliers from Supabase")
            raise HTTPException(
                status_code=503,
                detail="Unable to load suppliers",
            ) from exc

    raise HTTPException(status_code=503, detail="Unable to load suppliers")


@app.post("/suppliers", status_code=201)
def add_supplier(payload: SupplierPayload):
    data = payload.model_dump()
    data["brands"] = [brand.strip() for brand in data["brands"] if brand.strip()]

    try:
        response = supabase.table("suppliers").insert(data).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to add supplier",
        ) from exc

    if not response.data:
        raise HTTPException(status_code=500, detail="Supplier was not created")

    return response.data[0]


@app.put("/suppliers/{supplier_id}")
def update_supplier(supplier_id: int, payload: SupplierPayload):
    data = payload.model_dump()
    data["brands"] = [brand.strip() for brand in data["brands"] if brand.strip()]

    try:
        response = (
            supabase.table("suppliers")
            .update(data)
            .eq("id", supplier_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to update supplier",
        ) from exc

    if not response.data:
        raise HTTPException(status_code=404, detail="Supplier not found")
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
    return Response(status_code=204)


@app.get("/orders")
def get_orders():
    for attempt in range(3):
        try:
            response = (
                supabase.table("purchase_orders")
                .select(
                    "id,supplier_id,invoice_number,invoice_date,total_amount,status,"
                    "invoice_path,invoice_name,notes,created_at,"
                    "supplier:suppliers(id,name),items:purchase_order_items(*)"
                )
                .order("created_at", desc=True)
                .execute()
            )
            return response.data
        except Exception as exc:
            if attempt < 2:
                time.sleep(0.25 * (attempt + 1))
                continue
            logger.exception("Unable to load orders from Supabase")
            raise HTTPException(
                status_code=503,
                detail="Unable to load orders",
            ) from exc

    raise HTTPException(status_code=503, detail="Unable to load orders")


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
