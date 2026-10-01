import { randomUUID } from "node:crypto";
import {
  type AccountsLinkedDetail,
  type ContractChangedDetail,
  CustomerOrigin,
  customerIdFor,
  deterministicUuid,
  type LegacyAccountMigratedDetail,
  type MigratedAccountsRemovedDetail,
  originOf,
} from "@kundenportal/events";
import { type Caller, forbidden, germanDate, log, notFound } from "@kundenportal/service-kit";
import {
  type Customer,
  type CustomerUpdate,
  initialDisplayName,
  initialLocale,
} from "./customer.js";
import {
  contractSummary,
  type CustomerPage,
  type CustomerQuery,
  type CustomerSummary,
  profileSummary,
  selectPage,
  summarize,
} from "./directory.js";
import type { CustomerEvents } from "./publisher.js";
import type { CustomerRepository, ProfileRecord } from "./repository.js";

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
    if (existing) return this.listed(caller.tenantId, existing);
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
      return this.listed(caller.tenantId, winner);
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
    const record = await this.repository.update(caller.tenantId, current.customerId, update);
    await this.refreshDirectory(caller.tenantId, record);
    return record.customer;
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
    let existing = customer;
    if (!(await this.repository.create(tenantId, payload.subject, customer))) {
      const winner = await this.repository.findBySubject(tenantId, payload.subject);
      if (!winner) throw new Error("Customer link exists but profile is missing");
      const record = await this.repository.addLegacyData(tenantId, winner.customer.customerId, {
        address: payload.profile.address,
        ...(payload.profile.phone ? { phone: payload.profile.phone } : {}),
        legacyAccount: ref,
      });
      await this.refreshDirectory(tenantId, record);
      existing = record.customer;
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
    const record = await this.repository.addLegacyData(tenantId, payload.customerId, {
      legacyAccount: `${payload.linked.system}:${payload.linked.customerNumber}`,
    });
    await this.refreshDirectory(tenantId, record);
  }

  /**
   * `ContractChanged`: keeps the contract's summary in the customer directory. Snapshots
   * older than the stored one are ignored; the summary may arrive before the profile.
   */
  async onContractChanged(event: ContractChangedDetail): Promise<void> {
    const contract = contractSummary(event.payload.contract);
    const stored = await this.repository.directory.putContract(event.tenantId, contract);
    if (!stored) {
      log("info", "Older contract snapshot ignored", {
        tenantId: event.tenantId,
        contractId: contract.contractId,
        version: contract.version,
      });
    }
  }

  /**
   * `MigratedAccountsRemoved` (demo reset): deletes profile, identity link and the
   * directory's entries of each account.
   */
  async onMigratedAccountsRemoved(event: MigratedAccountsRemovedDetail): Promise<void> {
    const { tenantId, payload } = event;
    for (const { subject, customerId } of payload.accounts) {
      await this.repository.directory.removeCustomer(tenantId, customerId);
      await this.repository.remove(tenantId, subject, customerId);
    }
    log("info", "Removed customers deleted", { tenantId, count: payload.accounts.length });
  }

  /** `GET /admin/customers`: one page of the operator's tenant's customer directory. */
  async listCustomers(operator: Caller, query: CustomerQuery): Promise<CustomerPage> {
    const today = germanDate(this.clock.now());
    const entries = await this.repository.directory.entries(operator.tenantId);
    const summaries = [...entries.values()].flatMap((entry) =>
      entry.profile ? [summarize(entry.profile, entry.contracts, today)] : [],
    );
    return selectPage(summaries, query);
  }

  /**
   * `GET /admin/customers/{customerId}`: profile (the domain's own item, so customers not
   * yet in the directory are found too) and the directory's contract summaries.
   */
  async customerSummary(operator: Caller, customerId: string): Promise<CustomerSummary> {
    const [record, contracts] = await Promise.all([
      this.repository.get(operator.tenantId, customerId),
      this.repository.directory.contractsOf(operator.tenantId, customerId),
    ]);
    if (!record) throw notFound("Customer not found");
    return summarize(profileSummary(record.customer), contracts, germanDate(this.clock.now()));
  }

  private async refreshDirectory(tenantId: string, record: ProfileRecord): Promise<void> {
    await this.repository.directory.putProfile(
      tenantId,
      profileSummary(record.customer),
      record.rev,
    );
  }

  /**
   * Backfill of profiles from before phase 7: the first read writes the directory's
   * summary once and marks the profile. Their contracts appear in the directory with
   * their next `ContractChanged`. A failure here never fails the read; the next one
   * tries again.
   */
  private async listed(tenantId: string, record: ProfileRecord): Promise<Customer> {
    if (record.listed) return record.customer;
    try {
      await this.refreshDirectory(tenantId, record);
      await this.repository.markListed(tenantId, record.customer.customerId);
      log("info", "Customer added to the directory", {
        tenantId,
        customerId: record.customer.customerId,
      });
    } catch (error) {
      log("warn", "Directory backfill failed", {
        tenantId,
        customerId: record.customer.customerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return record.customer;
  }
}

function registeredEventId(customerId: string): string {
  return deterministicUuid(customerId, "CustomerRegistered");
}
