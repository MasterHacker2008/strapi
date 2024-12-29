const unparsed = require("koa-body/unparsed.js");
const stripe = require("stripe")(process.env.STRIPE_KEY);
const axios = require("axios");
const brevoUrl = process.env.BREVO_URL;
("use strict");

const countryCodes = [
  "AD",
  "AL",
  "AM",
  "AT",
  "AX",
  "AZ",
  "BA",
  "BE",
  "BG",
  "BY",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FO",
  "FR",
  "GE",
  "GG",
  "GI",
  "GL",
  "GR",
  "HR",
  "HU",
  "IE",
  "IM",
  "IS",
  "IT",
  "JE",
  "LI",
  "LT",
  "LU",
  "LV",
  "MC",
  "MD",
  "ME",
  "MK",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "RS",
  "RU",
  "SE",
  "SI",
  "SJ",
  "SK",
  "SM",
  "UA",
  "VA",
  "XK",
];

async function fulfillCheckout(sessionId) {
  console.log("Fulfilling Checkout Session ");

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price.product"],
  });

  const unixTimestamp = session.created;

  // Create a new Date object using the timestamp (in milliseconds)
  const date = new Date(unixTimestamp * 1000); // Multiply by 1000 to convert to milliseconds

  // Format the date to dd month yyyy
  const options = { day: "2-digit", month: "long", year: "numeric" };
  const formattedDate = date.toLocaleDateString("en-US", options);

  if (session.payment_status == "paid") {
    const orderData = {
      sessionId: sessionId,
      orderDate: formattedDate,
      name: session.customer_details.name,
      email: session.customer_details.email,
      address: session.shipping_details.address,
      priceDetails: {
        discount: "-0.00",
        subtotal: (session.amount_subtotal / 100).toFixed(2),
        vat: (session.total_details.amount_tax / 100).toFixed(2),
        shipping: (session.total_details.amount_shipping / 100).toFixed(2),
      },
      items: session.line_items.data.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        name: item.description, // Access description
        price: (item.amount_total / 100).toFixed(2), // total amount in cents
        image: item.price.product.images[0], // Access images
        color: item.price.product.description.split(",")[0],
        size: item.price.product.description.split(",")[1],
      })),
      total: (session.amount_total / 100).toFixed(2),
      paymentStatus: session.payment_status,
    };
    console.log(session);

    brevoBody = {
      to: [
        {
          email: orderData.email,
          name: orderData.name,
        },
      ],
      bcc: [
        {
          email: "arjunkunder866@gmail.com",
          name: "StylePlay",
        }
      ],
      templateId: 5,
      params: orderData,
      headers: {
        "X-Mailin-custom":
          "custom_header_1:custom_value_1|custom_header_2:custom_value_2|custom_header_3:custom_value_3",
        charset: "iso-8859-1",
      },
    };

    // Continue your local fulfillment logic (e.g., updating Strapi order)
    const updatedOrder = await strapi.services.order.update(
      { stripeId: sessionId }, // Find the order by stripeId
      { success: true }, // Mark the order as successful
      { email: session.customer_details.email }
    );

    // Send Confimation mail
    try {
      const response = await axios.post(brevoUrl, brevoBody, {
        headers: {
          "api-key": process.env.BREVO_KEY,
        },
      });
      // Handle response
    } catch (error) {
      // Handle error
      console.error("Error making POST request:", error);
    }
  }
}

module.exports = {
  async webhook(ctx) {
    const unparsedBody = ctx.request.body[unparsed];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = ctx.request.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(unparsedBody, sig, endpointSecret);
    } catch (err) {
      // Log and return an error if signature verification fails
      console.log(err);
      ctx.response.status = 400;
      return ctx.send(`Webhook Error: ${err.message}`);
    }

    // Handle different types of Stripe events
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      console.log("checkout successfull");
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
          const item = await strapi.services.product.findOne({
            id: product.id,
          });

          if (!item) {
            throw new Error(`Product with ID ${product.id} not found.`);
          }

          return {
            price_data: {
              currency: "eur",
              product_data: {
                name: item.title,
                description: `Color: ${product.color.name}, Size: ${product.size}`,
                images: [product.color.cartImage.url],
              },
              unit_amount: Math.round(item.price * 100),
            },
            quantity: product.quantity,
          };
        })
      );

      const session = await stripe.checkout.sessions.create({
        shipping_address_collection: { allowed_countries: countryCodes },
        shipping_options: [
          {
            shipping_rate: "shr_1QayevRojTAIyPrWwk0PTbyc", //Test Shipping rate
          },
        ],
        payment_method_types: ["card"],
        mode: "payment",
        success_url: process.env.CLIENT_URL + "/confirmation?success=true",
        cancel_url: process.env.CLIENT_URL + "/confirmation?success=false",
        line_items: lineItems,
        automatic_tax: {
          enabled: true,
        },
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
