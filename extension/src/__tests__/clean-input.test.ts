import { expect, it } from "vitest";
import { cleanIpInput, clipboardIpList } from "../query-input";
import { parseIps } from "../model";
it("cleans mixed text into a deduplicated list of whole addresses", () => {
  expect(
    cleanIpInput(
      '來源：1.2.3.4, src="8.8.8.8" [2001:0db8::1]\n2001:db8::1 junk',
    ),
  ).toBe("1.2.3.4\n8.8.8.8\n2001:db8::1");
});
it("never repairs or truncates malformed tokens", () => {
  for (const token of [
    "1.2.3.4abc",
    "999.1.2.3",
    "::1]/anything",
    "2001:db8::1]#fragment",
    "2001:db8::1]?query",
    "[::1",
    "::1]",
    "[::1]/64",
    "1.2.3.4/24",
    "foo1.2.3.4",
  ]) {
    expect(parseIps(token).invalid).toEqual([token]);
    expect(cleanIpInput(token)).toBeUndefined();
  }
  expect(cleanIpInput("hello 1.2.3.999 1.1.1.1")).toBe("1.1.1.1");
});
it("still limits automatic clipboard filling to pure IP lists", () => {
  expect(clipboardIpList("來源：1.1.1.1")).toBeUndefined();
  expect(clipboardIpList("1.1.1.1 [::1]")).toBe("1.1.1.1\n::1");
  expect(cleanIpInput("no addresses here")).toBeUndefined();
});
