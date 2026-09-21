import { describe, expect, it } from "vitest";

import {
  jsonToRows,
  rowsToData,
  snapshotKvDraft,
} from "@/components/kv/kv-fields";

describe("jsonToRows", () => {
  it("converts a string-only JSON object without changing values", () => {
    expect(jsonToRows('{"name":"api","enabled":"true"}')).toEqual([
      { key: "name", value: "api" },
      { key: "enabled", value: "true" },
    ]);
  });

  it.each([
    ['{"nested":{"token":"secret"}}', "nested objects"],
    ['{"enabled":true}', "booleans"],
    ['{"retries":3}', "numbers"],
    ['{"hosts":["one"]}', "arrays"],
  ])("rejects %s instead of coercing typed data (%s)", (json) => {
    expect(() => jsonToRows(json)).toThrow(
      "Key/value editor only supports string values",
    );
  });

  it("rejects invalid JSON without producing replacement rows", () => {
    expect(() => jsonToRows('{"token":')).toThrow();
  });

  it("rejects non-object JSON", () => {
    expect(() => jsonToRows('["secret"]')).toThrow(
      "Secret data must be a JSON object",
    );
  });

  it("preserves empty, whitespace, and prototype-like keys exactly", () => {
    const rows = jsonToRows('{"":"empty","  ":"spaces","__proto__":"safe"}');
    expect(rowsToData(rows)).toEqual(
      Object.fromEntries([
        ["", "empty"],
        ["  ", "spaces"],
        ["__proto__", "safe"],
      ]),
    );
  });

  it("omits only the synthetic blank row", () => {
    expect(rowsToData([{ key: "", value: "", placeholder: true }])).toEqual({});
    expect(rowsToData([{ key: "", value: "", keepEmptyKey: true }])).toEqual({ "": "" });
  });

  it("drops a key the user emptied instead of writing an empty-string field", () => {
    expect(rowsToData([{ key: "", value: "leftover" }])).toEqual({});
  });
});

describe("snapshotKvDraft", () => {
  it("keeps the data and CAS version from the moment editing begins", () => {
    const live = { token: "old", nested: { enabled: true } };
    const draft = snapshotKvDraft(live, 4);

    live.token = "refetched";
    live.nested.enabled = false;

    expect(draft).toEqual({
      data: { token: "old", nested: { enabled: true } },
      cas: 4,
    });
  });
});
