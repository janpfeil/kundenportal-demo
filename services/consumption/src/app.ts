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
import { NewReading } from "./model.js";
import type { ConsumptionService } from "./service.js";

const ContractId = z.uuid();

function contractIdOf(event: ApiEvent): string {
  const parsed = ContractId.safeParse(event.pathParameters?.contractId);
  if (!parsed.success) throw badRequest("Invalid contract id");
  return parsed.data;
}

export function createApi(service: ConsumptionService): ApiHandler {
  return router({
    "GET /contracts/{contractId}/readings": async (event) => {
      const caller = callerFrom(event);
      return json(200, { items: await service.readings(caller, contractIdOf(event)) });
    },
    "POST /contracts/{contractId}/readings": async (event) => {
      const caller = callerFrom(event);
      const contractId = contractIdOf(event);
      const input = parseBody(event, NewReading);
      return json(
        201,
        await service.submitReading(caller, contractId, input, event.requestContext.requestId),
      );
    },
    "GET /contracts/{contractId}/consumption": async (event) => {
      const caller = callerFrom(event);
      return json(200, await service.history(caller, contractIdOf(event)));
    },
    "GET /contracts/{contractId}/usage": async (event) => {
      const caller = callerFrom(event);
      return json(200, await service.usage(caller, contractIdOf(event)));
    },
  });
}
