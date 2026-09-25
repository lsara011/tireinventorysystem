import os
from dotenv import load_dotenv
from supabase import create_client, Client
from fastapi import FastAPI

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SECRET_KEY")
supabase = create_client(url,key)


try:
    response = supabase.table("tires").select("tire_brand").execute()
    print("Connection successful")
    print(response.data)
except Exception as e:
    print(f"Connection failed: {e}")