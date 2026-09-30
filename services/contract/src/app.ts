import {
  type ApiEvent,
  type ApiHandler,
  badRequest,
  callerFrom,
  json,
  parseBody,
  router,
} from "@kundenportal/service-kit";
import { z } from "zod";
import { ContractUpdate } from "./contract.js";
import type { ContractService } from "./service.js";

const ContractId = z.uuid();

function contractIdOf(event: ApiEvent): string {
  const parsed = ContractId.safeParse(event.pathParameters?.contractId);
  if (!parsed.success) throw badRequest("Invalid contract id");
  return parsed.data;
}

export function createApi(service: ContractService): ApiHandler {
  return router({
    "GET /contracts": async (event) => json(200, { items: await service.list(callerFrom(event)) }),
    "GET /contracts/{contractId}": async (event) => {
      const caller = callerFrom(event);
      return json(200, await service.get(caller, contractIdOf(event)));
    },
    "PATCH /contracts/{contractId}": async (event) => {
      const caller = callerFrom(event);
      const contractId = contractIdOf(event);
      const update = parseBody(event, ContractUpdate);
      return json(
        200,
        await service.update(caller, contractId, update, event.requestContext.requestId),
      );
    },
  });
}
