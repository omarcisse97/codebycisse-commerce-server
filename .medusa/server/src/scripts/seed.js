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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zY3JpcHRzL3NlZWQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFrSEEsa0RBK0xDO0FBOGVELCtCQThZQztBQTVxQ0QscURBSW1DO0FBQ25DLDREQWNxQztBQUNyQyw0Q0FBb0I7QUFDcEIsNERBQTZCO0FBQzdCLGdEQUF3QjtBQXVEeEIsMkRBQTJEO0FBQzNELFNBQVMsaUJBQWlCLENBQUMsT0FBZSxFQUFFLFlBQXlCO0lBQ2pFLElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQztJQUNyQixJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7SUFDaEIsT0FBTyxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFDOUIsTUFBTSxHQUFHLEdBQUcsT0FBTyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3BFLE9BQU8sRUFBRSxDQUFDO0lBQ2QsQ0FBQztJQUNELFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDekIsT0FBTyxNQUFNLENBQUM7QUFDbEIsQ0FBQztBQUdELFNBQVMsYUFBYSxDQUFDLElBQVk7SUFDL0IsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1IsT0FBTyxFQUFFLENBQUM7SUFDZCxDQUFDO0lBQ0QsT0FBTyxJQUFJO1NBQ04sUUFBUSxFQUFFO1NBQ1YsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLHNDQUFzQztTQUN2RCxPQUFPLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUMsb0JBQW9CO1NBQ3BELFdBQVcsRUFBRTtTQUNiLElBQUksRUFBRTtTQUNOLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDO1NBQ3BCLE9BQU8sQ0FBQyxVQUFVLEVBQUUsRUFB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