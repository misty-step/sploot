import assert from "node:assert/strict";
import { golden } from "./golden.js";

export const THRESHOLDS = {
  textTop: 3,
  textRate: 0.9,
  visualTop: 5,
  visualRate: 0.7,
  templateRate: 0.8,
};

export function rateAt(ranks, top) {
  if (ranks.length === 0) return 0;
  return ranks.filter((rank) => rank !== null && rank <= top).length / ranks.length;
}

export function templateRate(pairs) {
  if (pairs.length === 0) return 0;
  const hits = pairs.filter((pair) => pair.targetRank !== null && (pair.siblingRank === null || pair.targetRank < pair.siblingRank));
  return hits.length / pairs.length;
}

// A measured rate can pass or fail. A missing CLIP baseline makes the visual
// bucket not-yet-measurable even when the candidate's own rate is high.
export function bucketResult(bucket, rate, clipRate) {
  if (bucket === "text") return rate >= THRESHOLDS.textRate ? "pass" : "fail";
  if (bucket === "template") return rate >= THRESHOLDS.templateRate ? "pass" : "fail";
  if (bucket === "visual") {
    if (clipRate === null || clipRate === undefined) return "not-yet-measurable";
    return rate >= THRESHOLDS.visualRate && rate >= clipRate ? "pass" : "fail";
  }
  throw new Error(`unknown bucket ${bucket}`);
}

export function gateResult(results) {
  if (results.includes("fail")) return "fail";
  if (results.includes("not-yet-measurable")) return "not-yet-measurable";
  return "pass";
}

export function selfCheck() {
  assert.equal(golden.text.length, 15);
  assert.equal(golden.visual.length, 15);
  assert.equal(golden.templates.length, 10);
  assert.equal(golden.refused.length, 10);
  assert.equal(rateAt([1, 1, 1, 2, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 4], 3), 14 / 15);
  assert.equal(bucketResult("text", 14 / 15, null), "pass");
  assert.equal(bucketResult("text", 13 / 15, null), "fail");
  assert.equal(bucketResult("visual", 0.8, 0.7), "pass");
  assert.equal(bucketResult("visual", 0.8, 0.9), "fail");
  assert.equal(bucketResult("visual", 0.8, null), "not-yet-measurable");
  assert.equal(bucketResult("visual", 0.6, 0.5), "fail");
  assert.equal(templateRate([{ targetRank: 1, siblingRank: 2 }, { targetRank: 3, siblingRank: 3 }]), 0.5);
  assert.equal(bucketResult("template", 0.8, null), "pass");
  assert.equal(bucketResult("template", 0.7, null), "fail");
  assert.equal(gateResult(["pass", "pass", "pass", "pass"]), "pass");
  assert.equal(gateResult(["pass", "not-yet-measurable"]), "not-yet-measurable");
  assert.equal(gateResult(["pass", "fail", "not-yet-measurable"]), "fail");
  return "pass";
}
