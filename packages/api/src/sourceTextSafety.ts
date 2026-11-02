import * as lists from "../../../server/app/source_analysis/text_safety_lists.json";

const contains = (value: string, words: readonly string[]) => {
  const compact = value.replace(/\s+/g, "").toLowerCase();
  return words.some((word) => compact.includes(word.replace(/\s+/g, "").toLowerCase()));
};
export const hasHealthClaim = (value: string) => contains(value, lists.health);
export const hasPlatformText = (value: string) => contains(value, lists.platform);
const money = new RegExp(lists.moneyPattern, "i");
export const hasMoney = (value: string) => money.test(value);

const periodPatterns = lists.periodPatterns.map((pattern) => new RegExp(pattern));
export const hasPeriodText = (value: string) =>
  contains(value, lists.period) || periodPatterns.some((pattern) => pattern.test(value));
