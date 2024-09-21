// module.exports = (strapi) => {
//     return {
//       initialize() {
//         strapi.app.use(async (ctx, next) => {
//           if (ctx.request.path === '/orders/webhook' && ctx.request.method === 'POST') {
//             ctx.disableBodyParser = true; // Disable automatic body parsing for this route
//             await next();
//           } else {
//             await next();
//           }
//         });
//       },
//     };
//   };

module.exports = (strapi) => {
  return {
    initialize() {
      strapi.app.use(async (ctx, next) => {
        if (
          ctx.request.path === "/orders/webhook" &&
          ctx.request.method === "POST"
        ) {
          ctx.disableBodyParser = true; // Disable automatic body parsing for this route
          await next();
          // Access the raw request body
          const requestBody = ctx.request.rawBody;
          const contentType = ctx.request.headers["content-type"];
          console.log("Content-Type:", contentType);
          // Do something with the request body
          // console.log(requestBody);
        } else {
          await next();
        }
      });
    },
  };
};
