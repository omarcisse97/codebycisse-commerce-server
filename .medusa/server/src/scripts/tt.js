"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// [
//   {
//     title: "Medusa T-Shirt",
//     category_ids: [
//       categoryResult.find((cat) => cat.name === "Shirts")!.id,
//     ],
//     description: "Reimagine the feeling of a classic T-shirt. With our cotton T-shirts, everyday essentials no longer have to be ordinary.",
//     handle: "t-shirt",
//     weight: 400,
//     status: ProductStatus.PUBLISHED,
//     shipping_profile_id: shippingProfile.id,
//     images: [
//       {
//         url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
//       },
//       {
//         url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-back.png",
//       },
//       {
//         url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-front.png",
//       },
//       {
//         url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-back.png",
//       },
//     ],
//     options: [
//       {
//         title: "Size",
//         values: ["S", "M", "L", "XL"],
//       },
//       {
//         title: "Color",
//         values: ["Black", "White"],
//       },
//     ],
//     variants: [
//       {
//         title: "S / Black",
//         sku: "SHIRT-S-BLACK",
//         options: {
//           Size: "S",
//           Color: "Black",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "S / White",
//         sku: "SHIRT-S-WHITE",
//         options: {
//           Size: "S",
//           Color: "White",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "M / Black",
//         sku: "SHIRT-M-BLACK",
//         options: {
//           Size: "M",
//           Color: "Black",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "M / White",
//         sku: "SHIRT-M-WHITE",
//         options: {
//           Size: "M",
//           Color: "White",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "L / Black",
//         sku: "SHIRT-L-BLACK",
//         options: {
//           Size: "L",
//           Color: "Black",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "L / White",
//         sku: "SHIRT-L-WHITE",
//         options: {
//           Size: "L",
//           Color: "White",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "XL / Black",
//         sku: "SHIRT-XL-BLACK",
//         options: {
//           Size: "XL",
//           Color: "Black",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "XL / White",
//         sku: "SHIRT-XL-WHITE",
//         options: {
//           Size: "XL",
//           Color: "White",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//     ],
//     sales_channels: [
//       {
//         id: defaultSalesChannel[0].id,
//       },
//     ],
//   },
//   {
//     title: "Medusa Sweatshirt",
//     category_ids: [
//       categoryResult.find((cat) => cat.name === "Sweatshirts")!.id,
//     ],
//     description: "Reimagine the feeling of a classic sweatshirt. With our cotton sweatshirt, everyday essentials no longer have to be ordinary.",
//     handle: "sweatshirt",
//     weight: 400,
//     status: ProductStatus.PUBLISHED,
//     shipping_profile_id: shippingProfile.id,
//     images: [
//       {
//         url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
//       },
//       {
//         url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-back.png",
//       },
//     ],
//     options: [
//       {
//         title: "Size",
//         values: ["S", "M", "L", "XL"],
//       },
//     ],
//     variants: [
//       {
//         title: "S",
//         sku: "SWEATSHIRT-S",
//         options: {
//           Size: "S",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "M",
//         sku: "SWEATSHIRT-M",
//         options: {
//           Size: "M",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "L",
//         sku: "SWEATSHIRT-L",
//         options: {
//           Size: "L",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "XL",
//         sku: "SWEATSHIRT-XL",
//         options: {
//           Size: "XL",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//     ],
//     sales_channels: [
//       {
//         id: defaultSalesChannel[0].id,
//       },
//     ],
//   },
//   {
//     title: "Medusa Sweatpants",
//     category_ids: [
//       categoryResult.find((cat) => cat.name === "Pants")!.id,
//     ],
//     description: "Reimagine the feeling of classic sweatpants. With our cotton sweatpants, everyday essentials no longer have to be ordinary.",
//     handle: "sweatpants",
//     weight: 400,
//     status: ProductStatus.PUBLISHED,
//     shipping_profile_id: shippingProfile.id,
//     images: [
//       {
//         url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-front.png",
//       },
//       {
//         url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-back.png",
//       },
//     ],
//     options: [
//       {
//         title: "Size",
//         values: ["S", "M", "L", "XL"],
//       },
//     ],
//     variants: [
//       {
//         title: "S",
//         sku: "SWEATPANTS-S",
//         options: {
//           Size: "S",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "M",
//         sku: "SWEATPANTS-M",
//         options: {
//           Size: "M",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "L",
//         sku: "SWEATPANTS-L",
//         options: {
//           Size: "L",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "XL",
//         sku: "SWEATPANTS-XL",
//         options: {
//           Size: "XL",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//     ],
//     sales_channels: [
//       {
//         id: defaultSalesChannel[0].id,
//       },
//     ],
//   },
//   {
//     title: "Medusa Shorts",
//     category_ids: [
//       categoryResult.find((cat) => cat.name === "Merch")!.id,
//     ],
//     description: "Reimagine the feeling of classic shorts. With our cotton shorts, everyday essentials no longer have to be ordinary.",
//     handle: "shorts",
//     weight: 400,
//     status: ProductStatus.PUBLISHED,
//     shipping_profile_id: shippingProfile.id,
//     images: [
//       {
//         url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png",
//       },
//       {
//         url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-back.png",
//       },
//     ],
//     options: [
//       {
//         title: "Size",
//         values: ["S", "M", "L", "XL"],
//       },
//     ],
//     variants: [
//       {
//         title: "S",
//         sku: "SHORTS-S",
//         options: {
//           Size: "S",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "M",
//         sku: "SHORTS-M",
//         options: {
//           Size: "M",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "L",
//         sku: "SHORTS-L",
//         options: {
//           Size: "L",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//       {
//         title: "XL",
//         sku: "SHORTS-XL",
//         options: {
//           Size: "XL",
//         },
//         prices: [
//           {
//             amount: 10,
//             currency_code: "eur",
//           },
//           {
//             amount: 15,
//             currency_code: "usd",
//           },
//         ],
//       },
//     ],
//     sales_channels: [
//       {
//         id: defaultSalesChannel[0].id,
//       },
//     ],
//   },
// ]
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2NyaXB0cy90dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLElBQUk7QUFDSixNQUFNO0FBQ04sK0JBQStCO0FBQy9CLHNCQUFzQjtBQUN0QixpRUFBaUU7QUFDakUsU0FBUztBQUNULCtJQUErSTtBQUMvSSx5QkFBeUI7QUFDekIsbUJBQW1CO0FBQ25CLHVDQUF1QztBQUN2QywrQ0FBK0M7QUFDL0MsZ0JBQWdCO0FBQ2hCLFVBQVU7QUFDViw4RkFBOEY7QUFDOUYsV0FBVztBQUNYLFVBQVU7QUFDViw2RkFBNkY7QUFDN0YsV0FBVztBQUNYLFVBQVU7QUFDViw4RkFBOEY7QUFDOUYsV0FBVztBQUNYLFVBQVU7QUFDViw2RkFBNkY7QUFDN0YsV0FBVztBQUNYLFNBQVM7QUFDVCxpQkFBaUI7QUFDakIsVUFBVTtBQUNWLHlCQUF5QjtBQUN6Qix5Q0FBeUM7QUFDekMsV0FBVztBQUNYLFVBQVU7QUFDViwwQkFBMEI7QUFDMUIsc0NBQXNDO0FBQ3RDLFdBQVc7QUFDWCxTQUFTO0FBQ1Qsa0JBQWtCO0FBQ2xCLFVBQVU7QUFDViw4QkFBOEI7QUFDOUIsZ0NBQWdDO0FBQ2hDLHFCQUFxQjtBQUNyQix1QkFBdUI7QUFDdkIsNEJBQTRCO0FBQzVCLGFBQWE7QUFDYixvQkFBb0I7QUFDcEIsY0FBYztBQUNkLDBCQUEwQjtBQUMxQixvQ0FBb0M7QUFDcEMsZUFBZTtBQUNmLGNBQWM7QUFDZCwwQkFBMEI7QUFDMUIsb0NBQW9DO0FBQ3BDLGVBQWU7QUFDZixhQUFhO0FBQ2IsV0FBVztBQUNYLFVBQVU7QUFDViw4QkFBOEI7QUFDOUIsZ0NBQWdDO0FBQ2hDLHFCQUFxQjtBQUNyQix1QkFBdUI7QUFDdkIsNEJBQTRCO0FBQzVCLGFBQWE7QUFDYixvQkFBb0I7QUFDcEIsY0FBYztBQUNkLDBCQUEwQjtBQUMxQixvQ0FBb0M7QUFDcEMsZUFBZTtBQUNmLGNBQWM7QUFDZCww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