import { describe, expect, it } from "vitest";
import type { ParamDef } from "@/lib/api";
import { checkParam } from "./param-form";

const intDef: ParamDef = { name: "short", label: "短期期間", type: "int", default: 20, min: 2, max: 200, step: 1, description: "" };
const floatDef: ParamDef = { ...intDef, name: "k", type: "float", min: 0.5, max: 4 };

describe("checkParam", () => {
  it("正しい値は null", () => {
    expect(checkParam(intDef, "20")).toBeNull();
    expect(checkParam(floatDef, "2.5")).toBeNull();
  });
  it("空・数値以外・整数でない・範囲外を見分ける", () => {
    expect(checkParam(intDef, "")).toContain("入力");
    expect(checkParam(intDef, "abc")).toContain("数値");
    expect(checkParam(intDef, "2.5")).toContain("整数");
    expect(checkParam(intDef, "1")).toContain("2 〜 200");
    expect(checkParam(floatDef, "5")).toContain("0.5 〜 4");
  });
});
