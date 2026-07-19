import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";

function cleanupTestingDom() {
  cleanup();
  document.body.innerHTML = "";
}

afterEach(cleanupTestingDom);
