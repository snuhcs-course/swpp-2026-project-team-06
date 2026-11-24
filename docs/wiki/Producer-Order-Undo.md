# Producer Order Undo

DEV-455 adds a confirmed, server-side undo of the last producer order action: deposit confirmation/rejection (including rejection cancellation), shipment, refund issue and refund-settlement recording. It restores the prior order/payment/refund state only when no subsequent change conflicts. Consumer/operator cancellations and actual bank transfers or physical shipments are outside this operation.

Existing ManagerEvent audit records retain before/after state and a single-use action token without duplicating delivery addresses. Product/order locks, allocation and total-capacity checks, deposit deadline/code collision checks, current authorization and privacy masking apply. Payment records are reversed rather than deleted and can be approved again. Shipment undo advances trackingVersion. Idempotent retries acknowledge the same operation and return the current authorized order.

The Undo control in the screen header lists the recent actions the server still reports as undoable (newest first); choosing one opens a confirmation with the target order (name, order number, product, amount) and the current → restored status. The same confirmation is reachable from an order card's status chip (DEV-466). Multiple orders are undone individually. If another change intervened (409), the confirmation closes and the reason and refreshed list are shown. A cancelled rejection with an available undo remains discoverable in the all-orders list.

Reversed deposit confirmations have zero refundable balance in the manager view and are rejected by the shared refund operation. Datetimes are serialized consistently in UTC so availability survives subsequent database reads.

## Order cards (DEV-466)

The producer order screen (SCR-29) shows each order as one card: recipient name, order number and order time with a status chip; product photo (the producer's own product thumbnail), product name, option × quantity and amount; a task strip (depositor name and deposit deadline, carrier and tracking number, or refund state); and an action row (order details, chat for awaiting deposits, add/edit tracking). Awaiting-deposit and unsettled-refund cards keep the existing reject 1 : approve 2 buttons and inline reasons. Tapping the status chip re-identifies the order and offers only the next server actions (approve or reject a deposit, ship this order, settle or hold a refund) plus undo of the last action; producers still cannot mark orders delivered. A search box filters the current tab by order number, recipient, depositor name or tracking number.
