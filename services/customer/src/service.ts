import { randomUUID } from "node:crypto";
import { type Caller, forbidden, log } from "@kundenportal/service-kit";
import {
  type Customer,
  type CustomerUpdate,
  initialDisplayName,
  initialLocale,
} from "./customer.js";
import type { CustomerEvents } from "./publisher.js";
import type { CustomerRepository } from "./repository.js";

export interface Clock {
  now(): Date;
}

/** Use cases of the customer domain, independent of Lambda and HTTP. */
export class CustomerService {
  constructor(
    private readonly repository: CustomerRepository,
    private readonly events: CustomerEvents,
    private readonly clock: Clock = { now: () => new Date() },
    private readonly newId: () => string = randomUUID,
  ) {}

  /** Returns the caller's profile and creates it on first access (then publishes `CustomerRegistered`). */
  async me(caller: Caller, correlationId: string): Promise<Customer> {
    const existing = await this.repository.findBySubject(caller.tenantId, caller.subject);
    if (existing) return existing;
    if (!caller.email) throw forbidden("Token has no email claim");

    const customer: Customer = {
      customerId: this.newId(),
      email: caller.email,
      displayName: initialDisplayName(caller.email, caller.name),
      locale: initialLocale(caller.locale),
      origin: "registration",
      createdAt: this.clock.now().toISOString(),
    };
    const created = await this.repository.create(caller.tenantId, caller.subject, customer);
    if (!created) {
      const winner = await this.repository.findBySubject(caller.tenantId, caller.subject);
      if (!winner) throw new Error("Customer link exists but profile is missing");
      return winner;
    }

    await this.events.customerRegistered({
      eventId: this.newId(),
      tenantId: caller.tenantId,
      occurredAt: customer.createdAt,
      correlationId,
      payload: {
        customerId: customer.customerId,
        subject: caller.subject,
        email: customer.email,
        displayName: customer.displayName,
        locale: customer.locale,
        origin: customer.origin,
      },
    });
    log("info", "Customer registered", {
      tenantId: caller.tenantId,
      customerId: customer.customerId,
    });
    return customer;
  }

  async updateMe(caller: Caller, update: CustomerUpdate, correlationId: string): Promise<Customer> {
    const current = await this.me(caller, correlationId);
    return this.repository.update(caller.tenantId, current.customerId, update);
  }
}
