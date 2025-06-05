import { Modules } from "@medusajs/modules-sdk"; // ✅ This is the real Modules enum
import type { MedusaContainer } from "@medusajs/types"; // ✅ for proper typing (optional)

export default async function main({ container }: { container: MedusaContainer }) {
  console.log("🧹 Resetting Medusa DB...");

  // 💥 Delete Products
  const productModule = container.resolve(Modules.PRODUCT);
  const products = await productModule.list({}, { select: ["id"] });
  for (const product of products) {
    await productModule.delete(product.id);
  }

  // 💥 Delete Categories
  const categoryModule = container.resolve(Modules.PRODUCT_CATEGORY);
  const categories = await categoryModule.list({}, { select: ["id"] });
  for (const category of categories) {
    await categoryModule.delete(category.id);
  }

  // 💥 Delete Regions
  const regionModule = container.resolve(Modules.REGION);
  const regions = await regionModule.list({}, { select: ["id"] });
  for (const region of regions) {
    await regionModule.delete(region.id);
  }

  // 💥 Delete Shipping Profiles
  const shippingProfileModule = container.resolve(Modules.SHIPPING_PROFILE);
  const profiles = await shippingProfileModule.list({}, { select: ["id"] });
  for (const profile of profiles) {
    await shippingProfileModule.delete(profile.id);
  }

  // 💥 Delete Sales Channels
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);
  const channels = await salesChannelModule.list({}, { select: ["id"] });
  for (const channel of channels) {
    await salesChannelModule.delete(channel.id);
  }

  console.log("✅ Reset complete.");
}
