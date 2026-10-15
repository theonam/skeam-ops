// Origine : egm-app `src/server/db/errors.test.ts`.
import { describe, expect, it } from "vitest";
import { pgErrorCode } from "./errors";

describe("code d'erreur PostgreSQL", () => {
  it("le lit sur l'erreur ou sur sa cause (erreur enveloppée par Drizzle)", () => {
    expect(pgErrorCode({ code: "23505" })).toBe("23505");
    expect(pgErrorCode(Object.assign(new Error("Failed query"), { cause: { code: "23P01" } }))).toBe("23P01");
    expect(pgErrorCode(new Error("autre"))).toBeUndefined();
  });
});
