/**
 * Fake SQL tag for unit tests.
 *
 * Matches against the joined template string. Returns canned rows for the
 * first matching fingerprint, otherwise returns an empty array. Records all
 * calls so tests can assert on them.
 */

import { vi } from "vitest";
import type { SqlTag } from "@/db/client";

export type FakeSqlMatch = {
  /** Substring to look for in the joined template. First match wins. */
  match: string;
  /** Rows to return when matched. */
  rows: unknown[];
};

export type FakeSqlCall = {
  query: string;
  params: unknown[];
};

export type FakeSql = SqlTag & {
  __calls: FakeSqlCall[];
  /** Add or replace a match. Useful between phases of a single test. */
  __setMatch: (match: string, rows: unknown[]) => void;
};

export const makeFakeSql = (matches: FakeSqlMatch[] = []): FakeSql => {
  const calls: FakeSqlCall[] = [];
  const matchList = [...matches];

  const tag = vi.fn(async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const joined = strings.join("?");
    calls.push({ query: joined, params });
    for (const m of matchList) {
      if (joined.includes(m.match)) return m.rows;
    }
    return [];
  }) as unknown as FakeSql;

  tag.__calls = calls;
  tag.__setMatch = (match, rows) => {
    const existing = matchList.find((m) => m.match === match);
    if (existing) existing.rows = rows;
    else matchList.push({ match, rows });
  };

  return tag;
};
