# Producer Order Undo

DEV-455 adds a confirmed, server-side undo of the last producer order action: deposit confirmation/rejection (including rejection cancellation), shipment, refund issue and refund-settlement recording. It restores the prior order/payment/refund state only when no subsequent change conflicts. Consumer/operator cancellations and actual bank transfers or physical shipments are outside this operation.

Existing ManagerEvent audit records retain before/after state and a single-use action token without duplicating delivery addresses. Product/order locks, allocation and total-capacity checks, deposit deadline/code collision checks, current authorization and privacy masking apply. Payment records are reversed rather than deleted and can be approved again. Shipment undo advances trackingVersion. Idempotent retries acknowledge the same operation and return the current authorized order.

A single Undo control in the screen header opens confirmation for the most recent action and restored status. Multiple orders are processed individually and partial failures remain visible. A cancelled rejection with an available undo remains discoverable in the all-orders list. Local implementation awaits human review; production has not been changed.

Reversed deposit confirmations have zero refundable balance in the manager view and are rejected by the shared refund operation. Datetimes are serialized consistently in UTC so availability survives subsequent database reads.
