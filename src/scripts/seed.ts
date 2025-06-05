import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import {
    ContainerRegistrationKeys,
    Modules,
    ProductStatus,
} from "@medusajs/framework/utils";
import {
    createApiKeysWorkflow,
    createInventoryLevelsWorkflow,
    createProductCategoriesWorkflow,
    createProductsWorkflow,
    createRegionsWorkflow,
    createSalesChannelsWorkflow,
    createShippingOptionsWorkflow,
    createShippingProfilesWorkflow,
    createStockLocationsWorkflow,
    createTaxRegionsWorkflow,
    linkSalesChannelsToApiKeyWorkflow,
    linkSalesChannelsToStockLocationWorkflow,
    updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import fs from 'fs';
import csv from 'csv-parser';
import path from "path";




interface Category {
    id: string;
    name: string;
}

interface ShippingProfile {
    id: string;
}

interface SalesChannel {
    id: string;
}

interface ProductOption {
    title: string;
    values: string[];
}

interface VariantOptions {
    [key: string]: string;
}

interface Price {
    amount: number;
    currency_code: string;
}

interface Variant {
    title: string;
    sku: string;
    options: VariantOptions;
    prices: Price[];
}

interface Product {
    title: string;
    description: string;
    handle: string;
    weight: number;
    status: ProductStatus;
    category_ids: string[];
    images: { url: string }[];
    options: ProductOption[];
    shipping_profile_id: string;
    variants: Variant[];
    sales_channels: { id: string }[];
    // Internal map, removed before returning
    _optionsAllowedValues?: Map<string, string[]>;
}

// Helper function to slugify a string for URL-safe handles
function generateUniqueSku(baseSku: string, existingSkus: Set<string>): string {
    let newSku = baseSku;
    let counter = 1;
    while (existingSkus.has(newSku)) {
        newSku = `${baseSku}-${Math.random().toString(36).substring(2, 6)}`;
        counter++;
    }
    existingSkus.add(newSku);
    return newSku;
}


function slugifyString(text: string): string {
    if (!text) {
        return '';
    }
    return text
        .toString()
        .normalize('NFD') // Normalize characters (e.g., é -> e)
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

function parsePrice(value: string | undefined): number | null {
    if (!value) return null;
    const amount = parseFloat(value);
    return !isNaN(amount) ? Math.round(amount * 100) : null;
}

export async function loadProductsFromCSV(
    filePath: string,
    categoryResult: Category[],
    shippingProfile: ShippingProfile,
    defaultSalesChannel: SalesChannel[]
): Promise<Product[]> {
const existingSkus = new Set<string>();
    return new Promise((resolve, reject) => {
        const productsMap = new Map<string, Product>();
        

        if (!defaultSalesChannel || defaultSalesChannel.length === 0) {
            reject(new Error('[loadProductsFromCSV] defaultSalesChannel array is empty'));
            return;
        }

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row: any) => {
                try {
                    const rawHandle = (row.Handle || '').toString();
                    const productHandle = slugifyString(rawHandle);

                    if (!productHandle) {
                        console.warn(`[loadProductsFromCSV] Skipping row due to missing or invalid Handle after slugification: ${JSON.stringify(row)}`);
                        return;
                    }

                    if (!productsMap.has(productHandle)) {
                        // Parse categories safely
                        const productCategories = row.Medusa_Categories
                            ? row.Medusa_Categories
                                .toString()
                                .split(',')
                                .map((catName: string) => {
                                    const trimmedName = catName.trim();
                                    const foundCat = categoryResult.find(cat => cat.name === trimmedName);
                                    return foundCat ? foundCat.id : null;
                                })
                                .filter((id): id is string => !!id)
                            : [];

                        // Parse images safely
                        const productImages = row.Medusa_Images
                            ? row.Medusa_Images
                                .toString()
                                .split(',')
                                .map((url: string) => url.trim())
                                .filter(Boolean)
                                .map(url => ({ url }))
                            : [];

                        let productOptions: ProductOption[] = [];
                        const productOptionsAllowedValuesMap = new Map<string, string[]>();

                        if (row.Medusa_Product_Options) {
                            try {
                                const parsedOptions = JSON.parse(row.Medusa_Product_Options);
                                productOptions = parsedOptions.map((opt: { name: string; values: string[] }) => {
                                    const optionName = opt.name.trim();
                                    const trimmedValues = opt.values.map(val => val.trim());
                                    productOptionsAllowedValuesMap.set(optionName, trimmedValues);
                                    return {
                                        title: optionName,
                                        values: trimmedValues,
                                    };
                                });
                            } catch (jsonErr) {
                                console.error(`[loadProductsFromCSV] Error parsing Medusa_Product_Options for handle ${productHandle}: ${row.Medusa_Product_Options}`, jsonErr);
                            }
                        }

                        const statusUpper = (row.Status || '').toString().toUpperCase();
                        const rawStatus = (row.Status || '').toString().toLowerCase();

                        let productStatus: ProductStatus;

                        switch (rawStatus) {
                            case 'active':
                            case 'published':
                                productStatus = ProductStatus.PUBLISHED;
                                break;
                            case 'draft':
                                productStatus = ProductStatus.DRAFT;
                                break;
                            default:
                                productStatus = ProductStatus.PUBLISHED;
                        }



                        productsMap.set(productHandle, {
                            title: row.Medusa_Title || row.Title || 'Missing Title',
                            description: row.Medusa_Description || row.Description || '',
                            handle: productHandle,
                            weight: parseInt(row['Variant Grams']) || 0,
                            status: productStatus,
                            category_ids: productCategories,
                            images: productImages,
                            options: productOptions,
                            shipping_profile_id: shippingProfile.id,
                            variants: [],
                            sales_channels: [{ id: defaultSalesChannel[0].id }],
                            _optionsAllowedValues: productOptionsAllowedValuesMap,
                        });
                    }

                    const product = productsMap.get(productHandle)!;
                    const productOptionsAllowedValues = product._optionsAllowedValues!;

                    // Parse variant options safely
                    let rawVariantOptions: VariantOptions = {};
                    if (row.Medusa_Variant_Options) {
                        try {
                            rawVariantOptions = JSON.parse(row.Medusa_Variant_Options);
                        } catch (jsonErr) {
                            console.error(`[loadProductsFromCSV] Error parsing Medusa_Variant_Options for handle ${productHandle}: ${row.Medusa_Variant_Options}`, jsonErr);
                        }
                    }

                    // Build validated variant options
                    const finalVariantOptions: VariantOptions = {};
                    for (const productOption of product.options) {
                        const optionTitle = productOption.title;
                        const rawVariantValue = rawVariantOptions[optionTitle];
                        const allowedValues = productOptionsAllowedValues.get(optionTitle);

                        let finalValueToAssign = '';

                        if (typeof rawVariantValue === 'string' && rawVariantValue.trim() !== '') {
                            const trimmedRaw = rawVariantValue.trim();
                            if (allowedValues && allowedValues.includes(trimmedRaw)) {
                                finalValueToAssign = trimmedRaw;
                            } else {
                                console.warn(
                                    `[loadProductsFromCSV] Variant option '${optionTitle}' for handle '${productHandle}' has invalid value '${trimmedRaw}'. Falling back to first allowed value if available. Allowed: [${allowedValues?.join(', ') ?? 'none'}]`
                                );
                                finalValueToAssign = (allowedValues && allowedValues.length > 0) ? allowedValues[0] : '';
                            }
                        } else {
                            console.warn(
                                `[loadProductsFromCSV] Variant option '${optionTitle}' for handle '${productHandle}' has missing or invalid value '${rawVariantValue}'. Falling back to first allowed value if available.`
                            );
                            finalValueToAssign = (allowedValues && allowedValues.length > 0) ? allowedValues[0] : '';
                        }

                        finalVariantOptions[optionTitle] = finalValueToAssign;
                    }

                    const variantTitle =
                        Object.values(finalVariantOptions)
                            .map(v => v.trim())
                            .join(' / ') || `Variant ${product.variants.length + 1}`;

                    const variantPrices: Price[] = [];

                    const usd = parsePrice(row.usd);
                    if (usd !== null) variantPrices.push({ amount: usd, currency_code: 'usd' });

                    const eur = parsePrice(row.eur);
                    if (eur !== null) variantPrices.push({ amount: eur, currency_code: 'eur' });

                    const cad = parsePrice(row.cad);
                    if (cad !== null) variantPrices.push({ amount: cad, currency_code: 'cad' });

                    const xof = parsePrice(row.xof);
                    if (xof !== null) variantPrices.push({ amount: xof, currency_code: 'xof' });

                    const variant: Variant = {
                        title: row['Variant Title'] || variantTitle,
                        // sku: row['Variant SKU'] || `sku-${Math.random().toString(36).substring(2, 10)}`,
                        sku: generateUniqueSku(row['Variant SKU'], existingSkus),
                        options: finalVariantOptions,
                        prices: variantPrices,
                    };

                    product.variants.push(variant);
                } catch (err) {
                    console.error(`[loadProductsFromCSV] Error processing row: ${JSON.stringify(row)}`, err);
                }
            })
            .on('end', () => {
                // Remove internal maps before returning
                const finalProducts = Array.from(productsMap.values()).map(({ _optionsAllowedValues, ...rest }) => rest);
                resolve(finalProducts);
            })
            .on('error', (error) => {
                console.error('[loadProductsFromCSV] CSV parsing error:', error);
                reject(error);
            });
    });
}


const getMedusaProducts = async (categoryResult, shippingProfile, defaultSalesChannel) => {
    return [
        {
            title: "Medusa T-Shirt",
            category_ids: [
                categoryResult.find((cat) => cat.name === "Shirts")!.id,
            ],
            description: "Reimagine the feeling of a classic T-shirt. With our cotton T-shirts, everyday essentials no longer have to be ordinary.",
            handle: "t-shirt",
            weight: 400,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            images: [
                {
                    url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
                },
                {
                    url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-back.png",
                },
                {
                    url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-front.png",
                },
                {
                    url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-back.png",
                },
            ],
            options: [
                {
                    title: "Size",
                    values: ["S", "M", "L", "XL"],
                },
                {
                    title: "Color",
                    values: ["Black", "White"],
                },
            ],
            variants: [
                {
                    title: "S / Black",
                    sku: "SHIRT-S-BLACK",
                    options: {
                        Size: "S",
                        Color: "Black",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "S / White",
                    sku: "SHIRT-S-WHITE",
                    options: {
                        Size: "S",
                        Color: "White",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "M / Black",
                    sku: "SHIRT-M-BLACK",
                    options: {
                        Size: "M",
                        Color: "Black",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "M / White",
                    sku: "SHIRT-M-WHITE",
                    options: {
                        Size: "M",
                        Color: "White",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "L / Black",
                    sku: "SHIRT-L-BLACK",
                    options: {
                        Size: "L",
                        Color: "Black",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "L / White",
                    sku: "SHIRT-L-WHITE",
                    options: {
                        Size: "L",
                        Color: "White",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "XL / Black",
                    sku: "SHIRT-XL-BLACK",
                    options: {
                        Size: "XL",
                        Color: "Black",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "XL / White",
                    sku: "SHIRT-XL-WHITE",
                    options: {
                        Size: "XL",
                        Color: "White",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
            ],
            sales_channels: [
                {
                    id: defaultSalesChannel[0].id,
                },
            ],
        },
        {
            title: "Medusa Sweatshirt",
            category_ids: [
                categoryResult.find((cat) => cat.name === "Sweatshirts")!.id,
            ],
            description: "Reimagine the feeling of a classic sweatshirt. With our cotton sweatshirt, everyday essentials no longer have to be ordinary.",
            handle: "sweatshirt",
            weight: 400,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            images: [
                {
                    url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
                },
                {
                    url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-back.png",
                },
            ],
            options: [
                {
                    title: "Size",
                    values: ["S", "M", "L", "XL"],
                },
            ],
            variants: [
                {
                    title: "S",
                    sku: "SWEATSHIRT-S",
                    options: {
                        Size: "S",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "M",
                    sku: "SWEATSHIRT-M",
                    options: {
                        Size: "M",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "L",
                    sku: "SWEATSHIRT-L",
                    options: {
                        Size: "L",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "XL",
                    sku: "SWEATSHIRT-XL",
                    options: {
                        Size: "XL",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
            ],
            sales_channels: [
                {
                    id: defaultSalesChannel[0].id,
                },
            ],
        },
        {
            title: "Medusa Sweatpants",
            category_ids: [
                categoryResult.find((cat) => cat.name === "Pants")!.id,
            ],
            description: "Reimagine the feeling of classic sweatpants. With our cotton sweatpants, everyday essentials no longer have to be ordinary.",
            handle: "sweatpants",
            weight: 400,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            images: [
                {
                    url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-front.png",
                },
                {
                    url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-back.png",
                },
            ],
            options: [
                {
                    title: "Size",
                    values: ["S", "M", "L", "XL"],
                },
            ],
            variants: [
                {
                    title: "S",
                    sku: "SWEATPANTS-S",
                    options: {
                        Size: "S",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "M",
                    sku: "SWEATPANTS-M",
                    options: {
                        Size: "M",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "L",
                    sku: "SWEATPANTS-L",
                    options: {
                        Size: "L",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "XL",
                    sku: "SWEATPANTS-XL",
                    options: {
                        Size: "XL",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
            ],
            sales_channels: [
                {
                    id: defaultSalesChannel[0].id,
                },
            ],
        },
        {
            title: "Medusa Shorts",
            category_ids: [
                categoryResult.find((cat) => cat.name === "Merch")!.id,
            ],
            description: "Reimagine the feeling of classic shorts. With our cotton shorts, everyday essentials no longer have to be ordinary.",
            handle: "shorts",
            weight: 400,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            images: [
                {
                    url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png",
                },
                {
                    url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-back.png",
                },
            ],
            options: [
                {
                    title: "Size",
                    values: ["S", "M", "L", "XL"],
                },
            ],
            variants: [
                {
                    title: "S",
                    sku: "SHORTS-S",
                    options: {
                        Size: "S",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "M",
                    sku: "SHORTS-M",
                    options: {
                        Size: "M",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "L",
                    sku: "SHORTS-L",
                    options: {
                        Size: "L",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
                {
                    title: "XL",
                    sku: "SHORTS-XL",
                    options: {
                        Size: "XL",
                    },
                    prices: [
                        {
                            amount: 10,
                            currency_code: "eur",
                        },
                        {
                            amount: 15,
                            currency_code: "usd",
                        },
                    ],
                },
            ],
            sales_channels: [
                {
                    id: defaultSalesChannel[0].id,
                },
            ],
        },
    ]
}

export default async function seedDemoData({ container }: ExecArgs) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const link = container.resolve(ContainerRegistrationKeys.LINK);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
    const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
    const storeModuleService = container.resolve(Modules.STORE);

    const countries = [
        "gb", // United Kingdom
        "de", // Germany
        "dk", // Denmark
        "se", // Sweden
        "fr", // France
        "es", // Spain
        "it", // Italy
        "us", // United States
        "ca", // Canada
        "ml", // Mali
        "ci", // Ivory Coast (Côte d'Ivoire)
        "sn", // Senegal
    ];

    logger.info("Seeding store data...");
    const [store] = await storeModuleService.listStores();
    let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
        name: "Default Sales Channel",
    });

    if (!defaultSalesChannel.length) {
        // create the default sales channel
        const { result: salesChannelResult } = await createSalesChannelsWorkflow(
            container
        ).run({
            input: {
                salesChannelsData: [
                    {
                        name: "Default Sales Channel",
                    },
                ],
            },
        });
        defaultSalesChannel = salesChannelResult;
    }

    await updateStoresWorkflow(container).run({
        input: {
            selector: { id: store.id },
            update: {
                supported_currencies: [
                    {
                        currency_code: "eur",
                        is_default: true,
                    },
                    {
                        currency_code: "usd",
                    },
                    {
                        currency_code: "cad",
                    },
                    {
                        currency_code: "xof", // West African CFA franc
                    },
                ],
                default_sales_channel_id: defaultSalesChannel[0].id,
            },
        },
    });

    logger.info("Seeding region data...");
    const { result: regionResult } = await createRegionsWorkflow(container).run({
        input: {
            regions: [
                {
                    name: "Europe",
                    currency_code: "eur",
                    countries,
                    payment_providers: ["pp_system_default"],
                },
            ],
        },
    });
    const region = regionResult[0];
    logger.info("Finished seeding regions.");

    logger.info("Seeding tax regions...");
    await createTaxRegionsWorkflow(container).run({
        input: countries.map((country_code) => ({
            country_code,
            provider_id: "tp_system",
        })),
    });
    logger.info("Finished seeding tax regions.");

    logger.info("Seeding stock location data...");
    const { result: stockLocationResult } = await createStockLocationsWorkflow(
        container
    ).run({
        input: {
            locations: [
                {
                    name: "European Warehouse",
                    address: {
                        city: "Copenhagen",
                        country_code: "DK",
                        address_1: "",
                    },
                },
                {
                    name: "US Warehouse",
                    address: {
                        city: "New York",
                        country_code: "US",
                        address_1: "",
                    },
                },
                {
                    name: "Canada Warehouse",
                    address: {
                        city: "Toronto",
                        country_code: "CA",
                        address_1: "",
                    },
                },
                {
                    name: "West Africa Warehouse - Mali",
                    address: {
                        city: "Bamako",
                        country_code: "ML",
                        address_1: "",
                    },
                },
                {
                    name: "West Africa Warehouse - Ivory Coast",
                    address: {
                        city: "Abidjan",
                        country_code: "CI",
                        address_1: "",
                    },
                },
                {
                    name: "West Africa Warehouse - Senegal",
                    address: {
                        city: "Dakar",
                        country_code: "SN",
                        address_1: "",
                    },
                },
            ],
        },
    });

    const stockLocation = stockLocationResult[0];

    await link.create({
        [Modules.STOCK_LOCATION]: {
            stock_location_id: stockLocation.id,
        },
        [Modules.FULFILLMENT]: {
            fulfillment_provider_id: "manual_manual",
        },
    });

    logger.info("Seeding fulfillment data...");
    const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
        type: "default",
    });
    let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;

    if (!shippingProfile) {
        const { result: shippingProfileResult } =
            await createShippingProfilesWorkflow(container).run({
                input: {
                    data: [
                        {
                            name: "Default Shipping Profile",
                            type: "default",
                        },
                    ],
                },
            });
        shippingProfile = shippingProfileResult[0];
    }

    const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
        name: "Global Warehouse delivery",
        type: "shipping",
        service_zones: [
            {
                name: "Europe",
                geo_zones: [
                    { country_code: "gb", type: "country" },
                    { country_code: "de", type: "country" },
                    { country_code: "dk", type: "country" },
                    { country_code: "se", type: "country" },
                    { country_code: "fr", type: "country" },
                    { country_code: "es", type: "country" },
                    { country_code: "it", type: "country" },
                ],
            },
            {
                name: "North America",
                geo_zones: [
                    { country_code: "us", type: "country" },
                    { country_code: "ca", type: "country" },
                ],
            },
            {
                name: "West Africa",
                geo_zones: [
                    { country_code: "ml", type: "country" },
                    { country_code: "ci", type: "country" },
                    { country_code: "sn", type: "country" },
                ],
            },
        ],
    });

    await link.create({
        [Modules.STOCK_LOCATION]: {
            stock_location_id: stockLocation.id,
        },
        [Modules.FULFILLMENT]: {
            fulfillment_set_id: fulfillmentSet.id,
        },
    });

    await createShippingOptionsWorkflow(container).run({
        input: [
            {
                name: "Standard Shipping",
                price_type: "flat",
                provider_id: "manual_manual",
                service_zone_id: fulfillmentSet.service_zones[0].id,
                shipping_profile_id: shippingProfile.id,
                type: {
                    label: "Standard",
                    description: "Ship in 2-3 days.",
                    code: "standard",
                },
                prices: [
                    {
                        currency_code: "usd",
                        amount: 10,
                    },
                    {
                        currency_code: "eur",
                        amount: 10,
                    },
                    {
                        currency_code: "xof", // West African CFA franc
                        amount: 6000, // example price in XOF
                    },
                ],
                rules: [
                    {
                        attribute: "enabled_in_store",
                        value: "true",
                        operator: "eq",
                    },
                    {
                        attribute: "is_return",
                        value: "false",
                        operator: "eq",
                    },
                ],
            },
            {
                name: "Express Shipping",
                price_type: "flat",
                provider_id: "manual_manual",
                service_zone_id: fulfillmentSet.service_zones[0].id,
                shipping_profile_id: shippingProfile.id,
                type: {
                    label: "Express",
                    description: "Ship in 24 hours.",
                    code: "express",
                },
                prices: [
                    {
                        currency_code: "usd",
                        amount: 20,
                    },
                    {
                        currency_code: "eur",
                        amount: 20,
                    },
                    {
                        currency_code: "xof", // West African CFA franc
                        amount: 12000, // example price in XOF
                    },
                ],
                rules: [
                    {
                        attribute: "enabled_in_store",
                        value: "true",
                        operator: "eq",
                    },
                    {
                        attribute: "is_return",
                        value: "false",
                        operator: "eq",
                    },
                ],
            },
        ],
    });


    logger.info("Finished seeding fulfillment data.");

    // Assuming defaultSalesChannel is an array, get the first item clearly
    const defaultSalesChannelObj = defaultSalesChannel[0];

    await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: {
            id: stockLocation.id,             // stock location id
            add: [defaultSalesChannelObj.id], // array with sales channel id
        },
    });

    logger.info("Finished seeding stock location data.");

    logger.info("Seeding publishable API key data...");
    const { result: publishableApiKeyResult } = await createApiKeysWorkflow(container).run({
        input: {
            api_keys: [
                {
                    title: "Webshop",
                    type: "publishable",
                    created_by: "CodeByCisse", // can be empty or an admin user id if you have one
                },
            ],
        },
    });

    const publishableApiKey = publishableApiKeyResult[0];

    await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: {
            id: publishableApiKey.id,
            add: [defaultSalesChannel[0].id],
        },
    });
    logger.info("Finished seeding publishable API key data.");

    logger.info("Seeding product data...");

    const { result: categoryResult } = await createProductCategoriesWorkflow(container).run({
        input: {
            product_categories: [
                { name: "Shirts", is_active: true },
                { name: "Sweatshirts", is_active: true },
                { name: "Pants", is_active: true },
                { name: "Merch", is_active: true },
                { name: "Adult", is_active: true, description: "Lingerie & Intimate Products" },
                { name: "Electronics", is_active: true, description: "Gadgets & Devices" },
                { name: "Home & Living", is_active: true },
                { name: "Health & Wellness", is_active: true },
                { name: "Women's Essentials", is_active: true, description: "Wigs, Cosmetics, and More" },
                { name: "Men's Essentials", is_active: true },
            ],
        },
    });
    const csvFilePath = path.join(__dirname, 'medusa_seed_products_006.csv');
    const shopifyProducts = await loadProductsFromCSV(csvFilePath, categoryResult, shippingProfile, defaultSalesChannel);
    const medusaProducts = await getMedusaProducts(categoryResult, shippingProfile, defaultSalesChannel);
    await createProductsWorkflow(container).run({
        input: {
            products: [...shopifyProducts, ...medusaProducts],
        },
    });
    logger.info("Finished seeding product data.");

    logger.info("Seeding inventory levels.");

    const { data: inventoryItems } = await query.graph({
        entity: "inventory_item",
        fields: ["id"],
    });

    const inventoryLevels: CreateInventoryLevelInput[] = [];
    for (const inventoryItem of inventoryItems) {
        const inventoryLevel = {
            location_id: stockLocation.id,
            stocked_quantity: 1000000,
            inventory_item_id: inventoryItem.id,
        };
        inventoryLevels.push(inventoryLevel);
    }

    await createInventoryLevelsWorkflow(container).run({
        input: {
            inventory_levels: inventoryLevels,
        },
    });

    logger.info("Finished seeding inventory levels data.");
}
