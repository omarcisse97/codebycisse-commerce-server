"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadProductsFromCSV = loadProductsFromCSV;
exports.default = seedDemoData;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/medusa/core-flows");
const fs_1 = __importDefault(require("fs"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const path_1 = __importDefault(require("path"));
// Helper function to slugify a string for URL-safe handles
function generateUniqueSku(baseSku, existingSkus) {
    let newSku = baseSku;
    let counter = 1;
    while (existingSkus.has(newSku)) {
        newSku = `${baseSku}-${Math.random().toString(36).substring(2, 6)}`;
        counter++;
    }
    existingSkus.add(newSku);
    return newSku;
}
function slugifyString(text) {
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
function parsePrice(value) {
    if (!value)
        return null;
    const amount = parseFloat(value);
    return !isNaN(amount) ? Math.round(amount * 100) : null;
}
async function loadProductsFromCSV(filePath, categoryResult, shippingProfile, defaultSalesChannel) {
    const existingSkus = new Set();
    return new Promise((resolve, reject) => {
        const productsMap = new Map();
        if (!defaultSalesChannel || defaultSalesChannel.length === 0) {
            reject(new Error('[loadProductsFromCSV] defaultSalesChannel array is empty'));
            return;
        }
        fs_1.default.createReadStream(filePath)
            .pipe((0, csv_parser_1.default)())
            .on('data', (row) => {
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
                            .map((catName) => {
                            const trimmedName = catName.trim();
                            const foundCat = categoryResult.find(cat => cat.name === trimmedName);
                            return foundCat ? foundCat.id : null;
                        })
                            .filter((id) => !!id)
                        : [];
                    // Parse images safely
                    const productImages = row.Medusa_Images
                        ? row.Medusa_Images
                            .toString()
                            .split(',')
                            .map((url) => url.trim())
                            .filter(Boolean)
                            .map(url => ({ url }))
                        : [];
                    let productOptions = [];
                    const productOptionsAllowedValuesMap = new Map();
                    if (row.Medusa_Product_Options) {
                        try {
                            const parsedOptions = JSON.parse(row.Medusa_Product_Options);
                            productOptions = parsedOptions.map((opt) => {
                                const optionName = opt.name.trim();
                                const trimmedValues = opt.values.map(val => val.trim());
                                productOptionsAllowedValuesMap.set(optionName, trimmedValues);
                                return {
                                    title: optionName,
                                    values: trimmedValues,
                                };
                            });
                        }
                        catch (jsonErr) {
                            console.error(`[loadProductsFromCSV] Error parsing Medusa_Product_Options for handle ${productHandle}: ${row.Medusa_Product_Options}`, jsonErr);
                        }
                    }
                    const statusUpper = (row.Status || '').toString().toUpperCase();
                    const rawStatus = (row.Status || '').toString().toLowerCase();
                    let productStatus;
                    switch (rawStatus) {
                        case 'active':
                        case 'published':
                            productStatus = utils_1.ProductStatus.PUBLISHED;
                            break;
                        case 'draft':
                            productStatus = utils_1.ProductStatus.DRAFT;
                            break;
                        default:
                            productStatus = utils_1.ProductStatus.PUBLISHED;
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
                const product = productsMap.get(productHandle);
                const productOptionsAllowedValues = product._optionsAllowedValues;
                // Parse variant options safely
                let rawVariantOptions = {};
                if (row.Medusa_Variant_Options) {
                    try {
                        rawVariantOptions = JSON.parse(row.Medusa_Variant_Options);
                    }
                    catch (jsonErr) {
                        console.error(`[loadProductsFromCSV] Error parsing Medusa_Variant_Options for handle ${productHandle}: ${row.Medusa_Variant_Options}`, jsonErr);
                    }
                }
                // Build validated variant options
                const finalVariantOptions = {};
                for (const productOption of product.options) {
                    const optionTitle = productOption.title;
                    const rawVariantValue = rawVariantOptions[optionTitle];
                    const allowedValues = productOptionsAllowedValues.get(optionTitle);
                    let finalValueToAssign = '';
                    if (typeof rawVariantValue === 'string' && rawVariantValue.trim() !== '') {
                        const trimmedRaw = rawVariantValue.trim();
                        if (allowedValues && allowedValues.includes(trimmedRaw)) {
                            finalValueToAssign = trimmedRaw;
                        }
                        else {
                            console.warn(`[loadProductsFromCSV] Variant option '${optionTitle}' for handle '${productHandle}' has invalid value '${trimmedRaw}'. Falling back to first allowed value if available. Allowed: [${allowedValues?.join(', ') ?? 'none'}]`);
                            finalValueToAssign = (allowedValues && allowedValues.length > 0) ? allowedValues[0] : '';
                        }
                    }
                    else {
                        console.warn(`[loadProductsFromCSV] Variant option '${optionTitle}' for handle '${productHandle}' has missing or invalid value '${rawVariantValue}'. Falling back to first allowed value if available.`);
                        finalValueToAssign = (allowedValues && allowedValues.length > 0) ? allowedValues[0] : '';
                    }
                    finalVariantOptions[optionTitle] = finalValueToAssign;
                }
                const variantTitle = Object.values(finalVariantOptions)
                    .map(v => v.trim())
                    .join(' / ') || `Variant ${product.variants.length + 1}`;
                const variantPrices = [];
                const usd = parsePrice(row.usd);
                if (usd !== null)
                    variantPrices.push({ amount: usd, currency_code: 'usd' });
                const eur = parsePrice(row.eur);
                if (eur !== null)
                    variantPrices.push({ amount: eur, currency_code: 'eur' });
                const cad = parsePrice(row.cad);
                if (cad !== null)
                    variantPrices.push({ amount: cad, currency_code: 'cad' });
                const xof = parsePrice(row.xof);
                if (xof !== null)
                    variantPrices.push({ amount: xof, currency_code: 'xof' });
                const variant = {
                    title: row['Variant Title'] || variantTitle,
                    // sku: row['Variant SKU'] || `sku-${Math.random().toString(36).substring(2, 10)}`,
                    sku: generateUniqueSku(row['Variant SKU'], existingSkus),
                    options: finalVariantOptions,
                    prices: variantPrices,
                };
                product.variants.push(variant);
            }
            catch (err) {
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
                categoryResult.find((cat) => cat.name === "Shirts").id,
            ],
            description: "Reimagine the feeling of a classic T-shirt. With our cotton T-shirts, everyday essentials no longer have to be ordinary.",
            handle: "t-shirt",
            weight: 400,
            status: utils_1.ProductStatus.PUBLISHED,
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
                categoryResult.find((cat) => cat.name === "Sweatshirts").id,
            ],
            description: "Reimagine the feeling of a classic sweatshirt. With our cotton sweatshirt, everyday essentials no longer have to be ordinary.",
            handle: "sweatshirt",
            weight: 400,
            status: utils_1.ProductStatus.PUBLISHED,
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
                categoryResult.find((cat) => cat.name === "Pants").id,
            ],
            description: "Reimagine the feeling of classic sweatpants. With our cotton sweatpants, everyday essentials no longer have to be ordinary.",
            handle: "sweatpants",
            weight: 400,
            status: utils_1.ProductStatus.PUBLISHED,
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
                categoryResult.find((cat) => cat.name === "Merch").id,
            ],
            description: "Reimagine the feeling of classic shorts. With our cotton shorts, everyday essentials no longer have to be ordinary.",
            handle: "shorts",
            weight: 400,
            status: utils_1.ProductStatus.PUBLISHED,
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
    ];
};
async function seedDemoData({ container }) {
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    const link = container.resolve(utils_1.ContainerRegistrationKeys.LINK);
    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const fulfillmentModuleService = container.resolve(utils_1.Modules.FULFILLMENT);
    const salesChannelModuleService = container.resolve(utils_1.Modules.SALES_CHANNEL);
    const storeModuleService = container.resolve(utils_1.Modules.STORE);
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
        const { result: salesChannelResult } = await (0, core_flows_1.createSalesChannelsWorkflow)(container).run({
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
    await (0, core_flows_1.updateStoresWorkflow)(container).run({
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
    const { result: regionResult } = await (0, core_flows_1.createRegionsWorkflow)(container).run({
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
    await (0, core_flows_1.createTaxRegionsWorkflow)(container).run({
        input: countries.map((country_code) => ({
            country_code,
            provider_id: "tp_system",
        })),
    });
    logger.info("Finished seeding tax regions.");
    logger.info("Seeding stock location data...");
    const { result: stockLocationResult } = await (0, core_flows_1.createStockLocationsWorkflow)(container).run({
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
        [utils_1.Modules.STOCK_LOCATION]: {
            stock_location_id: stockLocation.id,
        },
        [utils_1.Modules.FULFILLMENT]: {
            fulfillment_provider_id: "manual_manual",
        },
    });
    logger.info("Seeding fulfillment data...");
    const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
        type: "default",
    });
    let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;
    if (!shippingProfile) {
        const { result: shippingProfileResult } = await (0, core_flows_1.createShippingProfilesWorkflow)(container).run({
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
        [utils_1.Modules.STOCK_LOCATION]: {
            stock_location_id: stockLocation.id,
        },
        [utils_1.Modules.FULFILLMENT]: {
            fulfillment_set_id: fulfillmentSet.id,
        },
    });
    await (0, core_flows_1.createShippingOptionsWorkflow)(container).run({
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
    await (0, core_flows_1.linkSalesChannelsToStockLocationWorkflow)(container).run({
        input: {
            id: stockLocation.id, // stock location id
            add: [defaultSalesChannelObj.id], // array with sales channel id
        },
    });
    logger.info("Finished seeding stock location data.");
    logger.info("Seeding publishable API key data...");
    const { result: publishableApiKeyResult } = await (0, core_flows_1.createApiKeysWorkflow)(container).run({
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
    await (0, core_flows_1.linkSalesChannelsToApiKeyWorkflow)(container).run({
        input: {
            id: publishableApiKey.id,
            add: [defaultSalesChannel[0].id],
        },
    });
    logger.info("Finished seeding publishable API key data.");
    logger.info("Seeding product data...");
    const { result: categoryResult } = await (0, core_flows_1.createProductCategoriesWorkflow)(container).run({
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
    const csvFilePath = path_1.default.join(__dirname, 'medusa_seed_products_006.csv');
    const shopifyProducts = await loadProductsFromCSV(csvFilePath, categoryResult, shippingProfile, defaultSalesChannel);
    const medusaProducts = await getMedusaProducts(categoryResult, shippingProfile, defaultSalesChannel);
    await (0, core_flows_1.createProductsWorkflow)(container).run({
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
    const inventoryLevels = [];
    for (const inventoryItem of inventoryItems) {
        const inventoryLevel = {
            location_id: stockLocation.id,
            stocked_quantity: 1000000,
            inventory_item_id: inventoryItem.id,
        };
        inventoryLevels.push(inventoryLevel);
    }
    await (0, core_flows_1.createInventoryLevelsWorkflow)(container).run({
        input: {
            inventory_levels: inventoryLevels,
        },
    });
    logger.info("Finished seeding inventory levels data.");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VlZC1mcm9tLXNob3BpZnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2NyaXB0cy9zZWVkLWZyb20tc2hvcGlmeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQWtIQSxrREErTEM7QUE4ZUQsK0JBOFlDO0FBNXFDRCxxREFJbUM7QUFDbkMsNERBY3FDO0FBQ3JDLDRDQUFvQjtBQUNwQiw0REFBNkI7QUFDN0IsZ0RBQXdCO0FBdUR4QiwyREFBMkQ7QUFDM0QsU0FBUyxpQkFBaUIsQ0FBQyxPQUFlLEVBQUUsWUFBeUI7SUFDakUsSUFBSSxNQUFNLEdBQUcsT0FBTyxDQUFDO0lBQ3JCLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztJQUNoQixPQUFPLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUM5QixNQUFNLEdBQUcsR0FBRyxPQUFPLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDcEUsT0FBTyxFQUFFLENBQUM7SUFDZCxDQUFDO0lBQ0QsWUFBWSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN6QixPQUFPLE1BQU0sQ0FBQztBQUNsQixDQUFDO0FBR0QsU0FBUyxhQUFhLENBQUMsSUFBWTtJQUMvQixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDUixPQUFPLEVBQUUsQ0FBQztJQUNkLENBQUM7SUFDRCxPQUFPLElBQUk7U0FDTixRQUFRLEVBQUU7U0FDVixTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsc0NBQXNDO1NBQ3ZELE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUMsQ0FBQyxvQkFBb0I7U0FDcEQsV0FBVyxFQUFFO1NBQ2IsSUFBSSxFQUFFO1NBQ04sT0FBTyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUM7U0FD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