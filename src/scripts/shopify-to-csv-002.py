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
def process_shopify_data_to_csv(file_path):
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

    # Create new columns
    df['Medusa_Description'] = ''
    df['Medusa_Categories'] = ''
    df['Medusa_Images'] = ''

    # Process each row
    for index, row in df.iterrows():
        # Clean HTML description
        cleaned_description = clean_html(row['Body (HTML)'])
        df.at[index, 'Medusa_Description'] = cleaned_description

        # Infer category
        shopify_tags = [tag.strip() for tag in row['Tags'].split(',') if tag.strip()] if row['Tags'] else []
        inferred_categories = infer_category(row['Title'], shopify_tags)
        df.at[index, 'Medusa_Categories'] = ', '.join(inferred_categories)

        # Extract images from the 'Image Src' column and any embedded in the HTML description
        all_images = []
        if row['Image Src']:
            all_images.append(row['Image Src'])
        all_images.extend(extract_image_urls_from_html(row['Body (HTML)']))
        
        # Remove duplicates and store as comma-separated string
        df.at[index, 'Medusa_Images'] = ', '.join(list(set(all_images)))

    return df

# --- Run the script and save output ---
if __name__ == "__main__":
    input_filename = 'products.csv'
    updated_df = process_shopify_data_to_csv(input_filename)

    if updated_df is not None:
        # Output to a new CSV file
        output_filename = "medusa_seed_products_002.csv"
        updated_df.to_csv(output_filename, index=False, encoding='utf-8')

        print(f"Successfully processed data and saved to {output_filename}")
        print("\n--- First 5 rows of the generated CSV ---")
        print(updated_df.head().to_string())