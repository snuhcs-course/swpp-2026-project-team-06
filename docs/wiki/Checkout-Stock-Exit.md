# Show a stock alert and return checkout to the product

DEV-353 | Local implementation prepared for human review

Checkout detects positive stock shortages and full sellout from current product data or server conflicts. Shortage and sellout use the same body copy asking the buyer to check remaining quantities and other options on the product page. It shows a modal and returns to the same product on confirmation or Escape, including direct-entry checkout and address history. No new order is created by dismissal. Existing price/pause flows and unresolved-deposit idempotency protections remain in force.

The source of truth is the related Korean feature specification and the issue-specific task file. Production deployment is a separate post-merge step.
