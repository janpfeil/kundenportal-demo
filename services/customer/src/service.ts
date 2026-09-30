import { randomUUID } from "node:crypto";
import {
  type AccountsLinkedDetail,
  CustomerOrigin,
  customerIdFor,
  deterministicUuid,
  type LegacyAccountMigratedDetail,
  originOf,
} from "@kundenportal/events";
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

    // Accounts taken over from a legacy system carry their origin in the token; their id
    // is derived from the identity, because the migration event may create them first.
    const origin = CustomerOrigin.safeParse(caller.origin).data ?? "registration";
    const legacy = origin !== "registration";
    const customer: Customer = {
      customerId: legacy ? customerIdFor(caller.tenantId, caller.subject) : this.newId(),
      email: caller.email,
      displayName: initialDisplayName(caller.email, caller.name),
      locale: initialLocale(caller.locale),
      origin,
      createdAt: this.clock.now().toISOString(),
    };
    const created = await this.repository.create(caller.tenantId, caller.subject, customer);
    if (!created) {
      const winner = await this.repository.findBySubject(caller.tenantId, caller.subject);
      if (!winner) throw new Error("Customer link exists but profile is missing");
      return winner;
    }

    await this.events.customerRegistered({
      eventId: legacy ? registeredEventId(customer.customerId) : this.newId(),
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

  /**
   * `LegacyAccountMigrated`: creates the customer with the master data from the legacy
   * system — or completes the profile if the first `/me` was faster — and announces it
   * with `CustomerRegistered`. The event id of that announcement is derived from the
   * customer id, the same as `/me` uses for legacy accounts, so a race or a redelivery
   * never yields two different announcements.
   */
  async onLegacyAccountMigrated(event: LegacyAccountMigratedDetail): Promise<void> {
    const { tenantId, payload } = event;
    const ref = `${payload.account.system}:${payload.account.customerNumber}`;
    const customer: Customer = {
      customerId: payload.customerId,
      email: payload.email,
      displayName: payload.displayName,
      locale: payload.locale,
      origin: originOf(payload.account.system),
      createdAt: event.occurredAt,
      address: payload.profile.address,
      ...(payload.profile.phone ? { phone: payload.profile.phone } : {}),
      legacyAccounts: [ref],
    };
    const created = await this.repository.create(tenantId, payload.subject, customer);
    const existing = created
      ? customer
      : await this.repository.findBySubject(tenantId, payload.subject);
    if (!existing) throw new Error("Customer link exists but profile is missing");
    if (!created) {
      await this.repository.addLegacyData(tenantId, existing.customerId, {
        address: payload.profile.address,
        ...(payload.profile.phone ? { phone: payload.profile.phone } : {}),
        legacyAccount: ref,
      });
    }
    await this.events.customerRegistered({
      eventId: registeredEventId(existing.customerId),
      tenantId,
      occurredAt: existing.createdAt,
      correlationId: event.correlationId,
      payload: {
        customerId: existing.customerId,
        subject: payload.subject,
        email: existing.email,
        displayName: existing.displayName,
        locale: existing.locale,
        origin: existing.origin,
      },
    });
    log("info", "Legacy customer ready", { tenantId, customerId: existing.customerId, ref });
  }

  /** `AccountsLinked`: records the linked legacy account in the profile. */
  async onAccountsLinked(event: AccountsLinkedDetail): Promise<void> {
    const { tenantId, payload } = event;
    await this.repository.addLegacyData(tenantId, payload.customerId, {
      legacyAccount: `${payload.linked.system}:${payload.linked.customerNumber}`,
    });
  }
}

function registeredEventId(customerId: string): string {
  return deterministicUuid(customerId, "CustomerRegistered");
}
