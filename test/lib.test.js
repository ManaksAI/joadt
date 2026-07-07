import { test, expect } from "vitest";
import { gripStatus, summarize } from "../src/lib.js";

test("gripStatus reflects operability", () => {
  expect(gripStatus({ operable: true, grip: "partial" })).toBe("operable");
  expect(gripStatus({ operable: false, grip: "partial" })).toBe("needs prep");
  expect(gripStatus({ operable: false, grip: "none" })).toBe("no grip");
});

test("summarize rolls up the roster", () => {
  const reg = [
    { operable: true, open_latches: 1 },
    { operable: false, open_latches: 2 },
  ];
  expect(summarize(reg)).toEqual({ total: 2, operable: 1, openLatches: 3 });
});

test("summarize handles an empty roster", () => {
  expect(summarize([])).toEqual({ total: 0, operable: 0, openLatches: 0 });
});
