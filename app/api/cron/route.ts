import Product from "@/lib/models/product.model";
import { connectToDB } from "@/lib/mongoose"
import { generateEmailBody, sendEmail } from "@/lib/nodemailer";
import { scrapeAmazonProduct } from "@/lib/scraper";
import { getAveragePrice, getEmailNotifType, getHighestPrice, getLowestPrice } from "@/lib/utils";
import { NextResponse } from "next/server";

export const maxDuration = 300;
export const dynamic = 'force-dynamic'
export const revalidate = 0;

export async function GET() {
    try {
       connectToDB();

       const products = await Product.find({});

       if(!products) throw new Error("No products found");

       // Scrape Letest product details & update db
       const updateProducts = await Promise.all(
        products.map(async (currentProduct) => {
            const scrapedProduct = await scrapeAmazonProduct(currentProduct.url);
           
            if(!scrapedProduct) throw new Error("No products found");
            
            const updatePriceHistory = [
                ...currentProduct.priceHistory,
                {price: scrapedProduct.currentPrice}
              ]
      
              const product = {
                ...scrapedProduct,
                priceHistory: updatePriceHistory,
                lowestPrice: getLowestPrice(updatePriceHistory),
                highestPrice: getHighestPrice(updatePriceHistory),
                averagePrice: getAveragePrice(updatePriceHistory),
              }
          
      
          const updateProduct = await Product.findOneAndUpdate(
            {url: product.url},
            product,
          );

          // check each product status & send email accordigly
            const emailNotifType = getEmailNotifType(product,
            currentProduct)

            if(emailNotifType && updateProduct.users.length > 0) {
                const productInfo = {
                    title: updateProduct.title,
                    url: updateProduct.url,
                }

                const emailContent = await generateEmailBody(productInfo, emailNotifType);

                const userEmails = updateProduct.users.map((user: any) => user.email)

                await sendEmail(emailContent, userEmails);
            }

            return updateProduct
          })
       )

       return NextResponse.json({
        message: 'Ok', data: updateProducts
       })
    } catch(error) {
        throw new Error(`Error in GET: ${error}`)
    }
}