# PayPal Sandbox Integration Notes

## Chosen payment contract

The application will use **PayPal Sandbox Orders v2** with server-side order creation and return-page capture. Credits are awarded only after the server validates a completed capture for the authenticated user. The browser must never determine the credited amount, package, or payment-completion state.

## Official sources

1. [PayPal Orders API v2](https://developer.paypal.com/docs/api/orders/v2/)
   
   PayPal documents the Orders API as the mechanism to create, retrieve, authorize, and capture orders. A buyer must approve an order before capture.

2. [PayPal Webhooks guide](https://developer.paypal.com/api/rest/webhooks/)

   PayPal documents webhooks as HTTPS callbacks and recommends message verification before acting on a notification. The current project deliberately uses return-page capture rather than webhook-based fulfillment, per the approved scope.

3. [PayPal webhook integration guide](https://developer.paypal.com/api/rest/webhooks/rest/)

   This guide documents HTTPS listener requirements and signature verification. It is retained as a future reference if the payment flow is upgraded from return-page capture to asynchronous fulfillment.

## Security constraints

- Use the PayPal Sandbox server-to-server OAuth endpoint for access tokens.
- Store the client secret only in environment configuration; never in source control or client code.
- Create and capture orders only on the server for the signed-in user.
- Persist PayPal resource IDs and application-specific fulfillment data, but do not store card data or raw payment credentials.
- Make fulfillment idempotent: a completed PayPal capture must never add credits twice.
