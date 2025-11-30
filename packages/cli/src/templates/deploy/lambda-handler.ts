/**
 * deploy/lambda/index.js template
 */

import { ProjectConfig } from '../../generators/types';

export function generateLambdaHandler(config: ProjectConfig): string {
  return `/**
 * Helpdesk Action Handler Lambda
 *
 * This Lambda handles actions from the Bedrock Agent for the helpdesk chatbot.
 * All data is mocked for testing purposes.
 */

// Mock customer database
const CUSTOMERS = {
  "CUST-12345": {
    customerId: "CUST-12345",
    name: "John Smith",
    email: "john.smith@example.com",
    accountStatus: "active",
    memberSince: "2023-01-15",
  },
  "CUST-67890": {
    customerId: "CUST-67890",
    name: "Jane Doe",
    email: "jane.doe@example.com",
    accountStatus: "active",
    memberSince: "2023-06-20",
  },
};

// Email to customer ID mapping
const EMAIL_TO_ID = {
  "john.smith@example.com": "CUST-12345",
  "jane.doe@example.com": "CUST-67890",
};

// Mock orders database
const ORDERS = {
  "ORD-001": {
    orderId: "ORD-001",
    customerId: "CUST-12345",
    status: "Delivered",
    items: ["Widget A", "Widget B"],
    total: 150.0,
    orderDate: "2024-01-10",
    deliveryDate: "2024-01-15",
  },
  "ORD-002": {
    orderId: "ORD-002",
    customerId: "CUST-12345",
    status: "In Transit",
    items: ["Gadget X"],
    total: 75.5,
    orderDate: "2024-01-18",
    estimatedDelivery: "2024-01-25",
  },
  "ORD-003": {
    orderId: "ORD-003",
    customerId: "CUST-12345",
    status: "Processing",
    items: ["Super Widget"],
    total: 299.99,
    orderDate: "2024-01-20",
    estimatedDelivery: "2024-01-28",
  },
};

// Mock ticket counter
let ticketCounter = 1000;

/**
 * Main Lambda handler for Bedrock Agent actions.
 */
exports.handler = async (event, context) => {
  console.log("Received event:", JSON.stringify(event));

  const actionGroup = event.actionGroup || "";
  const functionName = event.function || "";
  const parameters = event.parameters || [];

  const params = {};
  for (const param of parameters) {
    params[param.name] = param.value;
  }

  let result;
  switch (functionName) {
    case "validateCustomer":
      result = validateCustomer(params);
      break;
    case "getCustomerDetails":
      result = getCustomerDetails(params);
      break;
    case "getOrderStatus":
      result = getOrderStatus(params);
      break;
    case "createSupportTicket":
      result = createSupportTicket(params);
      break;
    default:
      result = { error: \`Unknown function: \${functionName}\` };
  }

  const response = {
    messageVersion: "1.0",
    response: {
      actionGroup: actionGroup,
      function: functionName,
      functionResponse: {
        responseBody: {
          TEXT: {
            body: JSON.stringify(result),
          },
        },
      },
    },
  };

  console.log("Returning response:", JSON.stringify(response));
  return response;
};

function validateCustomer(params) {
  const email = params.email;
  const customerId = params.customerId;

  if (email) {
    if (EMAIL_TO_ID[email]) {
      return { valid: true, customerId: EMAIL_TO_ID[email], message: \`Customer found with email \${email}\` };
    }
    return { valid: false, message: \`No customer found with email \${email}\` };
  }

  if (customerId) {
    if (CUSTOMERS[customerId]) {
      return { valid: true, customerId: customerId, message: \`Customer \${customerId} found\` };
    }
    return { valid: false, message: \`No customer found with ID \${customerId}\` };
  }

  return { valid: false, message: "Please provide either email or customerId" };
}

function getCustomerDetails(params) {
  const customerId = params.customerId;
  if (!customerId) return { error: "customerId is required" };
  if (CUSTOMERS[customerId]) return CUSTOMERS[customerId];
  return { error: \`Customer \${customerId} not found\` };
}

function getOrderStatus(params) {
  const orderId = params.orderId;
  if (!orderId) return { error: "orderId is required" };

  if (ORDERS[orderId]) {
    const order = ORDERS[orderId];
    return {
      orderId: order.orderId,
      status: order.status,
      items: order.items,
      total: order.total,
      orderDate: order.orderDate,
      deliveryInfo: order.deliveryDate || order.estimatedDelivery,
    };
  }

  return { error: \`Order \${orderId} not found\` };
}

function createSupportTicket(params) {
  const { customerId, subject, description, priority = "medium" } = params;

  if (!customerId) return { error: "customerId is required" };
  if (!subject) return { error: "subject is required" };
  if (!description) return { error: "description is required" };
  if (!CUSTOMERS[customerId]) return { error: \`Customer \${customerId} not found\` };

  ticketCounter += 1;
  const ticketId = \`TKT-\${ticketCounter}\`;

  return {
    ticketId,
    customerId,
    subject,
    description,
    priority,
    status: "Open",
    message: \`Support ticket \${ticketId} created successfully\`,
  };
}
`;
}

