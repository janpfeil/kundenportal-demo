/*
 * Shapes of the admin API for the zone's tests: a product with two price versions and a
 * metered contract of a customer, each overridable.
 */

import type { OperatorContract, Product } from "@/lib/contracts";

export const product = (overrides: Partial<Product> = {}): Product => ({
  productId: "strom-klassik",
  division: "electricity",
  name: "Strom Klassik",
  description: "Ökostrom aus der Region",
  status: "active",
  unit: "kWh",
  minimumTermMonths: 12,
  noticePeriodMonths: 1,
  version: 2,
  options: [
    { optionId: "standard", label: "Standard", monthlyPriceCent: 1200, workPriceCent: 32 },
    { optionId: "oeko", label: "Öko", monthlyPriceCent: 1200, workPriceCent: 34.5 },
  ],
  versions: [
    {
      version: 2,
      validFrom: "2026-10-01",
      createdAt: "2026-09-20T08:00:00Z",
      options: [
        { optionId: "standard", label: "Standard", monthlyPriceCent: 1200, workPriceCent: 32 },
        { optionId: "oeko", label: "Öko", monthlyPriceCent: 1200, workPriceCent: 34.5 },
      ],
    },
    {
      version: 1,
      validFrom: "2026-01-01",
      createdAt: "2025-12-01T08:00:00Z",
      options: [
        { optionId: "standard", label: "Standard", monthlyPriceCent: 1100, workPriceCent: 30 },
        { optionId: "oeko", label: "Öko", monthlyPriceCent: 1100, workPriceCent: 32 },
      ],
    },
  ],
  contractCount: { "1": 3, "2": 5 },
  updatedAt: "2026-09-20T08:00:00Z",
  ...overrides,
});

export const contract = (overrides: Partial<OperatorContract> = {}): OperatorContract => ({
  contractId: "0a1b2c3d-1111-2222-3333-444455556666",
  customerId: "K-100042",
  customerName: "Helga Kraus",
  division: "electricity",
  tariffName: "Strom Klassik",
  tariffOption: "standard",
  tariffOptions: ["standard", "oeko"],
  monthlyInstallmentCent: 8700,
  installmentAdjustable: true,
  installmentMinCent: 7000,
  installmentMaxCent: 13000,
  meterNumber: "1ESY1160123456",
  unit: "kWh",
  workPriceCent: 32,
  monthlyPriceCent: 1200,
  startDate: "2025-11-01",
  minimumTermMonths: 12,
  minimumTermEndDate: "2026-10-31",
  noticePeriodMonths: 1,
  earliestTerminationDate: "2026-10-31",
  status: "active",
  productId: "strom-klassik",
  productVersion: 1,
  updatedAt: "2026-09-30T10:00:00Z",
  ...overrides,
});
