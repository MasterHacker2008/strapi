const stripe = require('stripe')(process.env.STRIPE_KEY);
const axios = require('axios');

'use strict';

module.exports = {
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
                description: `Color: ${product.color}, Size: ${product.size}`,
              },
              unit_amount: Math.round(item.price * 100),
            },
            quantity: product.quantity,
          };
        })
      );

      const session = await stripe.checkout.sessions.create({
        shipping_address_collection: { allowed_countries: ['US', 'CA', "IE"] },
        payment_method_types: ["card"],
        mode: "payment",
        success_url: process.env.CLIENT_URL + "?success=true",
        cancel_url: process.env.CLIENT_URL + "?success=false",
        line_items: lineItems,
      });

      // Save the order with the Stripe session ID
      await strapi.services.order.create({ products, stripeSessionId: session.id });

      ctx.send({ stripeSession: session });
    } catch (error) {
      ctx.response.status = 500;
      console.error("Error creating Stripe session:", error.message);
      ctx.send({ error: error.message || "Internal server error" });
    }
  },

  // Webhook handler for Stripe
  async handleWebhook(ctx) {
    const sig = ctx.request.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;

    let event;
    try {
      event = stripe.webhooks.constructEvent(ctx.request.body, sig, endpointSecret);
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed: ${err.message}`);
      ctx.response.status = 400;
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // Fetch the order using the Stripe session ID
      const order = await strapi.services.order.findOne({ stripeSessionId: session.id });

      if (order) {
        // Update the order status to 'paid'
        const updatedOrder = await strapi.services.order.update({ id: order.id }, { status: 'paid' });

        // Post order data to Make.com
        try {
          await axios.post(makeWebhookUrl, {
            customer: updatedOrder.customer,
            products: updatedOrder.products,
            total: updatedOrder.total,
            orderDate: updatedOrder.createdAt,
          });
        } catch (error) {
          console.error('Error posting to Make.com webhook:', error);
        }
      }
    }

    ctx.send({ received: true });
  }
};
