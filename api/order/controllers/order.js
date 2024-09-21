
const unparsed = require("koa-body/unparsed.js");
const stripe = require('stripe')(process.env.STRIPE_KEY);
const axios = require('axios')
const makeWebhookUrl = process.env.makeWebhookUrl

'use strict';
async function fulfillCheckout(sessionId) {
  console.log('Fulfilling Checkout Session ');

  // TODO: Make this function safe to run multiple times,
  // even concurrently, with the same session ID

  // TODO: Make sure fulfillment hasn't already been
  // peformed for this Checkout Session

  // Retrieve the Checkout Session from the API with line_items expanded
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items'],
  });
  console.log(session)

  // Check the Checkout Session's payment_status property
  // to determine if fulfillment should be peformed
  if (session.payment_status == 'paid') {

    const orderData = {
      sessionId: sessionId,
      name: session.customer_details.name,
      email: session.customer_details.email,
      address: session.shipping_details.address,
      subtotal: session.amount_subtotal,
      totalDetails: session.totalDetails,
      lineItems: session.line_items.data.map((item) => ({
        name: item.name,
        description: item.description,
        price: item.amount,
        image: item.image,
        quantity: item.quantity,
      })),
      totalAmount: session.amount_total,
      paymentStatus: session.payment_status,
    };

    // POST the data to Make.com
    await axios.post(makeWebhookUrl, orderData);
    

    // Continue your local fulfillment logic (e.g., updating Strapi order)
    const updatedOrder = await strapi.services.order.update(
      { stripeId: sessionId }, // Find the order by stripeId
      { success: true } // Mark the order as successful
    );
    
   

  }
}

module.exports = {

  


  async webhook(ctx) {
    
    const unparsedBody = ctx.request.body[unparsed];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = ctx.request.headers['stripe-signature'];
 
    let event;

    

    try {
   
      event = stripe.webhooks.constructEvent(unparsedBody, sig, endpointSecret);
      
    } catch (err) {
      // Log and return an error if signature verification fails
      console.log(err)
      ctx.response.status = 400;
      return ctx.send(`Webhook Error: ${err.message}`);
    }

    // Handle different types of Stripe events
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object;
      console.log("checkout successfull")
      await fulfillCheckout(session.id); // Call your fulfillment logic
    }


    // Respond with success status
    ctx.response.status = 200;
    ctx.body = { received: true };
  },


  
  async create(ctx) {
    const { products } = ctx.request.body;

    try {
      const lineItems = await Promise.all(
        products.map(async (product) => {
          const item = await strapi.services.product.findOne({ id: product.id });

          if (!item) {
            throw new Error(`Product with ID ${product.id} not found.`);
          }

          return {
            price_data: {
              currency: "eur",
              product_data: {
                name: item.title,
                description: `Color: ${product.color.name}, Size: ${product.size}`,
                images: [product.color.cartImage.url]
              },
              unit_amount: Math.round(item.price * 100),
            },
            quantity: product.quantity,
          };
        })
      );


      const session = await stripe.checkout.sessions.create({
        shipping_address_collection: { allowed_countries: [] },
        payment_method_types: ["card"],
        mode: "payment",
        success_url: process.env.CLIENT_URL + "?success=true",
        cancel_url: process.env.CLIENT_URL + "?success=false",
        line_items: lineItems,
      });

      await strapi.services.order.create({ products, stripeId: session.id });


      ctx.send({ stripeSession: session });
    } catch (error) {
      ctx.response.status = 500;
      console.error("Error creating Stripe session:", error.message);
      ctx.send({ error: error.message || "Internal server error" });
    }
  },
};