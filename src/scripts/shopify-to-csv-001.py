import pandas as pd
from bs4 import BeautifulSoup
from slugify import slugify 
import os

# --- Configuration ---
INPUT_FILE = "products.csv"  # Your Shopify export file
OUTPUT_FILE = "medusa_seed_products.csv"

# --- Category keyword mapping ---
category_keywords = {
    "Bath & Body": ["shower", "steamer", "bath", "soap"],
    "Skin Care": ["scar", "silicone", "gel", "cream"],
    "Wellness": ["waist", "belt", "self-heating", "tourmaline"],
    "Hair Care": ["hair", "steamer cap", "hair cap"],
    "Health Accessories": ["pain relief", "magnetic", "therapy"],
    "Face Care": ["mask", "facial", "collagen"]
}

# --- Helper functions ---
def clean_description(html):
    if pd.isna(html):
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for img in soup.find_all("img"):
        img.decompose()
    return soup.get_text(separator=" ", strip=True)

def assign_category(title):
    title_lower = str(title).lower()
    for category, keywords in category_keywords.items():
        if any(keyword in title_lower for keyword in keywords):
            return category
    return "Other"

# --- Load and process ---
if not os.path.exists(INPUT_FILE):
    print(f"❌ Input file '{INPUT_FILE}' not found.")
    exit()

df = pd.read_csv(INPUT_FILE)

# Filter base products (ignore rows with no title)
base_products = df[df["Title"].notna()].copy()

# Clean HTML descriptions
base_products["description"] = base_products["Body (HTML)"].apply(clean_description)

# Assign categories
base_products["category"] = base_products["Title"].apply(assign_category)

# Create Medusa-compatible fields
medusa_df = pd.DataFrame()
medusa_df["title"] = base_products["Title"]
medusa_df["description"] = base_products["description"]
medusa_df["price"] = base_products["Variant Price"]
medusa_df["images"] = base_products["Image Src"]
medusa_df["category"] = base_products["category"]
medusa_df["handle"] = base_products["Title"].apply(slugify)
medusa_df["variants"] = base_products["Option1 Value"].fillna("Default Variant")

# Save to CSV
medusa_df.to_csv(OUTPUT_FILE, index=False)
print(f"✅ Medusa-compatible CSV generated: {OUTPUT_FILE}")
