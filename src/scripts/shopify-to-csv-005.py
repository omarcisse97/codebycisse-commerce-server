import pandas as pd
from bs4 import BeautifulSoup
import re
import json

# --- Configuration ---
# Your desired Medusa categories and keywords to match them from product titles
# You can expand and refine these keywords based on your actual product data.
CATEGORIES = {
    "Shirts": ["shirt", "t-shirt", "tee"],
    "Sweatshirts": ["sweatshirt", "hoodie", "jumper"],
    "Pants": ["pants", "jeans", "trousers", "leggings", "shorts"],
    "Merch": ["merch", "merchandise", "mug", "poster", "keychain"],
    "Adult": ["adult", "lingerie", "intimate", "sexy", "thong", "bra"],
    "Electronics": ["electronic", "earbud", "charger", "smartwatch", "bluetooth", "headphone", "device", "gadget", "usb"],
    "Home & Living": ["home", "decor", "kitchen", "lamp", "light", "candle", "garden", "furniture"],
    "Health & Wellness": ["health", "wellness", "care", "steamers", "scar", "massage", "therapy", "beauty", "hair", "skin", "body", "medical", "fitness"],
    "Women's Essentials": ["women's", "wig", "cosmetic", "makeup", "feminine"],
    "Men's Essentials": ["men's", "grooming", "male"],
}

# List of possible Shopify option columns
SHOPIFY_OPTION_NAMES = ['Option1 Name', 'Option2 Name', 'Option3 Name']
SHOPIFY_OPTION_VALUES = ['Option1 Value', 'Option2 Value', 'Option3 Value']

# Default currency and conversion factor for Medusa prices (e.g., USD to cents)
DEFAULT_CURRENCY_CODE = "usd"
PRICE_MULTIPLIER = 100 # Multiply by 100 to convert dollars to cents

# --- Helper Functions ---
def clean_html(html_content):
    """Strips HTML tags from a string."""
    if pd.isna(html_content) or not isinstance(html_content, str):
        return ""
    soup = BeautifulSoup(html_content, 'html.parser')
    # Remove script and style tags
    for s in soup(['script', 'style']):
        s.decompose()
    # Get text and clean up whitespace
    text = soup.get_text(separator=' ', strip=True)
    return text

def extract_image_urls_from_html(html_content):
    """Extracts image URLs from HTML content."""
    if pd.isna(html_content) or not isinstance(html_content, str):
        return []
    soup = BeautifulSoup(html_content, 'html.parser')
    img_urls = []
    for img in soup.find_all('img', src=True):
        img_urls.append(img['src'])
    return img_urls

def infer_category(title, shopify_tags):
    """Infers Medusa categories based on product title and existing Shopify tags."""
    title_lower = title.lower()
    inferred_categories = []

    for category_name, keywords in CATEGORIES.items():
        for keyword in keywords:
            if keyword.lower() in title_lower:
                inferred_categories.append(category_name)
                break 

    for tag in shopify_tags:
        for category_name, keywords in CATEGORIES.items():
            for keyword in keywords:
                if keyword.lower() == tag.lower():
                    if category_name not in inferred_categories:
                        inferred_categories.append(category_name)
                    break
            
    if not inferred_categories:
        return ["General"] 
    return list(set(inferred_categories))

# --- Main Processing Logic ---
def process_shopify_data_for_medusa_csv(file_path):
    try:
        df = pd.read_csv(file_path, sep=',', quotechar='"', escapechar='\\', na_values=[''])
    except FileNotFoundError:
        print(f"Error: The file '{file_path}' was not found. Please ensure it's in the same directory as the script.")
        return None
    except Exception as e:
        print(f"An error occurred while reading the CSV file: {e}")
        return None

    df = df.fillna('')

    # Create new columns for processed data
    df['Medusa_Description'] = ''
    df['Medusa_Categories'] = ''
    df['Medusa_Images'] = ''
    df['Medusa_Product_Options'] = '' 
    df['Medusa_Variant_Options'] = '' 
    df['Medusa_Price_Amount'] = 0 # New: Price in cents
    df['Medusa_Price_Currency'] = DEFAULT_CURRENCY_CODE # New: Currency code
    df['Medusa_Compare_At_Price_Amount'] = 0 # New: Compare at price in cents
    df['Medusa_Cost_Per_Item_Amount'] = 0 # New: Cost per item in cents


    # Process price columns to ensure numeric types and convert to cents
    price_cols_to_convert = ['Variant Price', 'Variant Compare At Price', 'Cost per item']
    for col in price_cols_to_convert:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
        else:
            df[col] = 0.0 # Add column if it doesn't exist, fill with 0

    # Populate Medusa-specific price columns
    df['Medusa_Price_Amount'] = (df['Variant Price'] * PRICE_MULTIPLIER).astype(int)
    df['Medusa_Compare_At_Price_Amount'] = (df['Variant Compare At Price'] * PRICE_MULTIPLIER).astype(int)
    df['Medusa_Cost_Per_Item_Amount'] = (df['Cost per item'] * PRICE_MULTIPLIER).astype(int)


    # Process each product (identified by unique Handle)
    unique_handles = df['Handle'].unique()

    for handle in unique_handles:
        product_rows = df[df['Handle'] == handle].copy() 
        first_row_idx = product_rows.index[0] 

        # --- Product-level data processing ---
        # Description
        cleaned_description = clean_html(df.at[first_row_idx, 'Body (HTML)'])
        
        # Categories
        shopify_tags = [tag.strip() for tag in df.at[first_row_idx, 'Tags'].split(',') if tag.strip()] if df.at[first_row_idx, 'Tags'] else []
        inferred_categories = infer_category(df.at[first_row_idx, 'Title'], shopify_tags)
        
        # Images (collect from Image Src of all variants and Body HTML of first)
        all_images = []
        if df.at[first_row_idx, 'Image Src']: 
            all_images.append(df.at[first_row_idx, 'Image Src'])
        all_images.extend(extract_image_urls_from_html(df.at[first_row_idx, 'Body (HTML)'])) 

        for _, variant_row in product_rows.iterrows():
            if variant_row['Variant Image']: 
                all_images.append(variant_row['Variant Image'])
        all_images = list(set(all_images)) # Remove duplicates

        # --- Options processing ---
        product_options = [] 
        
        option_names_map = {} 
        for i in range(len(SHOPIFY_OPTION_NAMES)):
            option_name_col = SHOPIFY_OPTION_NAMES[i]
            option_name = df.at[first_row_idx, option_name_col]
            if option_name: 
                option_names_map[option_name] = i + 1 

        for option_name, col_num in option_names_map.items():
            unique_values = set()
            for _, variant_row in product_rows.iterrows():
                option_value = variant_row[f'Option{col_num} Value']
                if option_value:
                    unique_values.add(option_value)
            
            if unique_values:
                product_options.append({
                    'name': option_name,
                    'values': sorted(list(unique_values)) 
                })
        
        # Store product-level processed data (propagated to all variants of this product)
        df.loc[df['Handle'] == handle, 'Medusa_Description'] = cleaned_description
        df.loc[df['Handle'] == handle, 'Medusa_Categories'] = ', '.join(inferred_categories)
        df.loc[df['Handle'] == handle, 'Medusa_Images'] = ', '.join(all_images)
        df.loc[df['Handle'] == handle, 'Medusa_Product_Options'] = json.dumps(product_options)

        # --- Variant-level options processing ---
        for idx, variant_row in product_rows.iterrows():
            variant_options = {}
            for option_name, col_num in option_names_map.items():
                option_value = variant_row[f'Option{col_num} Value']
                if option_value:
                    variant_options[option_name] = option_value
            df.loc[idx, 'Medusa_Variant_Options'] = json.dumps(variant_options)

    # Define the columns to keep in the final output
    desired_columns = [
        'Handle',
        'Title',
        'Vendor',
        # Removed original Shopify option columns (as they are consolidated into Medusa_Product/Variant_Options)
        
        # Original price columns (kept for reference, can remove if you only want Medusa_Price_Amount)
        'Variant Price',
        'Variant Compare At Price',
        'Cost per item',

        'Variant SKU',
        'Variant Grams',
        'Variant Inventory Tracker',
        'Variant Inventory Policy',
        'Variant Fulfillment Service',
        
        'Variant Requires Shipping',
        'Variant Taxable',
        'Variant Barcode',
        
        'Status',
        'Medusa_Description',
        'Medusa_Categories',
        'Medusa_Images',
        'Medusa_Product_Options',   
        'Medusa_Variant_Options',
        'Medusa_Price_Amount',          # New: Main price in cents
        'Medusa_Price_Currency',        # New: Currency code (e.g., 'usd')
        'Medusa_Compare_At_Price_Amount', # New: Compare at price in cents
        'Medusa_Cost_Per_Item_Amount'   # New: Cost per item in cents
    ]

    final_output_df = pd.DataFrame(columns=desired_columns)
    for col in desired_columns:
        if col in df.columns:
            final_output_df[col] = df[col]
        else:
            final_output_df[col] = '' 
            
    return final_output_df

# --- Run the script and save output ---
if __name__ == "__main__":
    input_filename = 'products.csv'
    processed_df = process_shopify_data_for_medusa_csv(input_filename)

    if processed_df is not None:
        output_filename = "medusa_seed_products_005.csv"
        processed_df.to_csv(output_filename, index=False, encoding='utf-8')

        print(f"\nSweet! Your fully cleaned product data, including prices and options, is saved in: {output_filename}")
        print("\n--- Here's a quick look at the first few rows: ---")
        print(processed_df.head().to_string())
        print("\n--- And these are all the columns you'll find: ---")
        print(processed_df.columns.tolist())