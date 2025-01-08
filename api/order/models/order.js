

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#lifecycle-hooks)
 * to customize this model
 */

module.exports = {
    lifecycles: {
      async beforeCreate(data) {
        // Generate orderId if it doesn't exist
        if (!data.orderId) {
          data.orderId = await generateUniqueOrderId();
        }
      },
      async beforeUpdate(params, data) {
        // Ensure orderId remains intact if not set
        if (!data.orderId) {
          data.orderId = await generateUniqueOrderId();
        }
      },
    },
  };
  
  // Helper function for generating a unique 6-character orderId
  async function generateUniqueOrderId() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '#';
    let exists = true;
  
    while (exists) {
      result = '#';
      for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
  
      // Check if orderId is unique in the database
      exists = await strapi.query('order').findOne({ orderId: result });
    }
  
    return result;
  }
  
