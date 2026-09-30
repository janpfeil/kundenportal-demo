import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Component tests opt into jsdom per file (`@vitest-environment jsdom`); the rest runs in Node.
afterEach(cleanup);
