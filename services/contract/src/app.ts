import { Division, IsoDate } from "@kundenportal/events";
import {
  type ApiEvent,
  type ApiHandler,
  badRequest,
  callerFrom,
  json,
  operatorFrom,
  parseBody,
  router,
} from "@kundenportal/service-kit";
import { z } from "zod";
import { ContractAction } from "./back-office.js";
import { ContractUpdate } from "./contract.js";
import { ContractQuery } from "./directory.js";
import { ContractOrder } from "./origins.js";
import { PriceVersionInput, ProductId, ProductInput, ProductUpdate } from "./products.js";
import type { ContractDomain } from "./wiring.js";

const ContractId = z.uuid();
const TerminationRequest = z.strictObject({ effectiveDate: IsoDate.optional() });
const ProductQuery = z.object({ division: Division.optional() });

function contractIdOf(event: ApiEvent): string {
  const parsed = ContractId.safeParse(event.pathParameters?.contractId);
  if (!parsed.success) throw badRequest("Invalid contract id");
  return parsed.data;
}

function productIdOf(event: ApiEvent): string {
  const parsed = ProductId.safeParse(event.pathParameters?.productId);
  if (!parsed.success) throw badRequest("Invalid product id");
  return parsed.data;
}

function parseQuery<T extends z.ZodType>(event: ApiEvent, schema: T): z.infer<T> {
  const result = schema.safeParse(event.queryStringParameters ?? {});
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join("; "));
  }
  return result.data;
}

/** A body that may be left out entirely (e.g. a termination to the earliest date). */
function optionalBody<T extends z.ZodType>(event: ApiEvent, schema: T): z.infer<T> {
  return event.body ? parseBody(event, schema) : parseBody({ ...event, body: "{}" }, schema);
}

const requestId = (event: ApiEvent) => event.requestContext.requestId;

/**
 * Routes of the contract domain: the customer's `/contracts` and `/products` (own data
 * only, from the token's subject) and the operator's `/admin/…` (`operatorFrom`: owner,
 * or the pass holder in the own pass tenant; everyone else gets 403).
 */
export function createApi({ customers, operator, catalogue }: ContractDomain): ApiHandler {
  return router({
    "GET /contracts": async (event) =>
      json(200, { items: await customers.list(callerFrom(event)) }),
    "POST /contracts": async (event) => {
      const caller = callerFrom(event);
      const order = parseBody(event, ContractOrder);
      return json(201, await customers.order(caller, order, requestId(event)));
    },
    "GET /contracts/{contractId}": async (event) => {
      const caller = callerFrom(event);
      return json(200, await customers.get(caller, contractIdOf(event)));
    },
    "PATCH /contracts/{contractId}": async (event) => {
      const caller = callerFrom(event);
      const contractId = contractIdOf(event);
      const update = parseBody(event, ContractUpdate);
      return json(200, await customers.update(caller, contractId, update, requestId(event)));
    },
    "POST /contracts/{contractId}/termination": async (event) => {
      const caller = callerFrom(event);
      const contractId = contractIdOf(event);
      const { effectiveDate } = optionalBody(event, TerminationRequest);
      return json(
        200,
        await customers.terminate(caller, contractId, effectiveDate, requestId(event)),
      );
    },
    "DELETE /contracts/{contractId}/termination": async (event) => {
      const caller = callerFrom(event);
      return json(
        200,
        await customers.cancelTermination(caller, contractIdOf(event), requestId(event)),
      );
    },
    "POST /contracts/{contractId}/withdrawal": async (event) => {
      const caller = callerFrom(event);
      return json(200, await customers.withdraw(caller, contractIdOf(event), requestId(event)));
    },
    "GET /products": async (event) => {
      const caller = callerFrom(event);
      const { division } = parseQuery(event, ProductQuery);
      return json(200, { items: await customers.products(caller, division) });
    },

    "GET /admin/overview": async (event) =>
      json(200, await operator.overview(operatorFrom(event).tenantId)),
    "GET /admin/contracts": async (event) => {
      const { tenantId } = operatorFrom(event);
      return json(200, await operator.contracts(tenantId, parseQuery(event, ContractQuery)));
    },
    "GET /admin/contracts/{contractId}": async (event) => {
      const { tenantId } = operatorFrom(event);
      return json(200, await operator.contract(tenantId, contractIdOf(event)));
    },
    "POST /admin/contracts/{contractId}/actions": async (event) => {
      const { tenantId } = operatorFrom(event);
      const contractId = contractIdOf(event);
      const action = parseBody(event, ContractAction);
      return json(200, await operator.act(tenantId, contractId, action, requestId(event)));
    },
    "GET /admin/products": async (event) => {
      const { tenantId } = operatorFrom(event);
      return json(200, { items: await catalogue.listForOperator(tenantId) });
    },
    "POST /admin/products": async (event) => {
      const { tenantId } = operatorFrom(event);
      const input = parseBody(event, ProductInput);
      return json(201, await catalogue.create(tenantId, input, requestId(event)));
    },
    "GET /admin/products/{productId}": async (event) => {
      const { tenantId } = operatorFrom(event);
      return json(200, await catalogue.getForOperator(tenantId, productIdOf(event)));
    },
    "PATCH /admin/products/{productId}": async (event) => {
      const { tenantId } = operatorFrom(event);
      const productId = productIdOf(event);
      const update = parseBody(event, ProductUpdate);
      return json(200, await catalogue.update(tenantId, productId, update, requestId(event)));
    },
    "POST /admin/products/{productId}/versions": async (event) => {
      const { tenantId } = operatorFrom(event);
      const productId = productIdOf(event);
      const input = parseBody(event, PriceVersionInput);
      return json(201, await catalogue.addVersion(tenantId, productId, input, requestId(event)));
    },
  });
}
