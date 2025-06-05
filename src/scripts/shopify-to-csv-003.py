import pandas as pd
from bs4 import BeautifulSoup
import re
from io import StringIO

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

    # Check for keywords in title
    for category_name, keywords in CATEGORIES.items():
        for keyword in keywords:
            if keyword.lower() in title_lower:
                inferred_categories.append(category_name)
                break # Found a match, move to next category

    # Also consider Shopify's 'Type' or 'Tags' if they are relevant
    for tag in shopify_tags:
        for category_name, keywords in CATEGORIES.items():
            for keyword in keywords:
                if keyword.lower() == tag.lower():
                    if category_name not in inferred_categories:
                        inferred_categories.append(category_name)
                    break
            
    if not inferred_categories:
        # Fallback: Assign 'General' if no specific category is found
        return ["General"] 
    return list(set(inferred_categories)) # Return unique categories

# --- Main Processing Logic ---
def process_shopify_data_for_medusa_csv(file_path):
    # Read the CSV file into a pandas DataFrame
    try:
        df = pd.read_csv(file_path, sep=',', quotechar='"', escapechar='\\', na_values=[''])
    except FileNotFoundError:
        print(f"Error: The file '{file_path}' was not found. Please ensure it's in the same directory as the script.")
        return None
    except Exception as e:
        print(f"An error occurred while reading the CSV file: {e}")
        return None

    # Fill NaN values with empty string for relevant columns to avoid errors during string operations
    df = df.fillna('')

    # Create temporary columns for processed data
    df['temp_Medusa_Description'] = ''
    df['temp_Medusa_Categories'] = ''
    df['temp_Medusa_Images'] = ''

    # Process each product (identified by unique Handle) to get product-level data
    # Shopify export often has product-level details only on the first variant row.
    # We will compute these once per product handle and then propagate.
    unique_handles = df['Handle'].unique()

    for handle in unique_handles:
        product_rows = df[df['Handle'] == handle]
        first_row_idx = product_rows.index[0] # Get the index of the first row for this product

        # Clean HTML description
        cleaned_description = clean_html(df.at[first_row_idx, 'Body (HTML)'])
        
        # Infer category
        shopify_tags = [tag.strip() for tag in df.at[first_row_idx, 'Tags'].split(',') if tag.strip()] if df.at[first_row_idx, 'Tags'] else []
        inferred_categories = infer_category(df.at[first_row_idx, 'Title'], shopify_tags)
        
        # Extract images from 'Image Src' and embedded in 'Body (HTML)'
        all_images = []
        if df.at[first_row_idx, 'Image Src']:
            all_images.append(df.at[first_row_idx, 'Image Src'])
        all_images.extend(extract_image_urls_from_html(df.at[first_row_idx, 'Body (HTML)']))
        
        # Add variant images from all rows for the current handle
        for _, variant_row in product_rows.iterrows():
            if variant_row['Variant Image']:
                all_images.append(variant_row['Variant Image'])

        # Store in temporary columns for all rows of this handle
        df.loc[df['Handle'] == handle, 'temp_Medusa_Description'] = cleaned_description
        df.loc[df['Handle'] == handle, 'temp_Medusa_Categories'] = ', '.join(list(set(inferred_categories))) # Ensure unique categories
        df.loc[df['Handle'] == handle, 'temp_Medusa_Images'] = ', '.join(list(set(all_images))) # Ensure unique image URLs

    # Define the columns to keep in the final output
    desired_columns = [
        'Handle',
        'Title',
        'Vendor',
        'Option1 Name',
        'Option1 Value',
        'Option2 Name',
        'Option2 Value',
        'Option3 Name',
        'Option3 Value',
        'Variant SKU',
        'Variant Grams',
        'Variant Inventory Tracker',
        'Variant Inventory Policy',
        'Variant Fulfillment Service',
        'Variant Price',
        'Variant Compare At Price',
        'Variant Requires Shipping',
        'Variant Taxable',
        'Variant Barcode',
        'Cost per item',
        'Status',
        'temp_Medusa_Description',  # Renamed to Medusa_Description later
        'temp_Medusa_Categories',   # Renamed to Medusa_Categories later
        'temp_Medusa_Images'        # Renamed to Medusa_Images later
    ]

    # Filter the DataFrame to include only desired columns
    # Handle cases where some desired columns might not exist in the original CSV
    final_columns = [col for col in desired_columns if col in df.columns]
    
    # Also add the newly created temp columns if they are not already in final_columns
    for temp_col in ['temp_Medusa_Description', 'temp_Medusa_Categories', 'temp_Medusa_Images']:
        if temp_col not in final_columns:
            final_columns.append(temp_col)

    output_df = df[final_columns].copy()

    # Rename the temporary columns to their final names
    output_df = output_df.rename(columns={
        'temp_Medusa_Description': 'Medusa_Description',
        'temp_Medusa_Categories': 'Medusa_Categories',
        'temp_Medusa_Images': 'Medusa_Images'
    })

    return output_df

# --- Run the script and save output ---
if __name__ == "__main__":
    input_filename = 'products.csv'
    processed_df = process_shopify_data_for_medusa_csv(input_filename)

    if processed_df is not None:
        output_filename = "medusa_seed_products_003.csv"
        processed_df.to_csv(output_filename, index=False, encoding='utf-8')

        print(f"Successfully processed data and saved to {output_filename}")
        print("\n--- First 5 rows of the generated CSV ---")
        print(processed_df.head().to_string())
        print("\n--- Columns in the generated CSV ---")
        print(processed_df.columns.tolist())