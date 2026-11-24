import { strict as assert } from "node:assert";
import { test } from "node:test";
import { defaultJudgingConfig, defaultJudgingControl, awardLabels } from "@conference/shared";
import type { JudgingTeacher, Rubric } from "@conference/shared";
import { calculate, type BallotRecord } from "./results";
import { evaluate, validateConfig, validateLook, validateRubric } from "./validation";

test("blank, zero and unseen scores retain distinct meanings", () => {
  const f = defaultJudgingConfig().rubrics.experience.fields[0];
  const form: Rubric = {
    title: "试评",
    description: "",
    fields: [
      { ...f, id: "a", max: 10 },
      { ...f, id: "b", max: 20, required: false, unseen: "prorate" }
    ]
  };
  validateRubric(form, "experience");
  assert.deepEqual(evaluate(form, { a: 0, b: 0 }), { answers: { a: 0, b: 0 }, status: "valid", units: 0 });
  assert.equal(evaluate(form, { a: 5, b: null }).status, "pending");
  assert.equal(evaluate(form, { a: "unseen", b: 20 }).units, null);
  assert.equal(evaluate(form, { a: 8, b: "unseen" }).units, 2400);
  assert.throws(() => evaluate(form, { b: 8 }), /请先完成/);
  assert.throws(() => evaluate(form, { a: 5.1, b: 10 }), /步长/);
  assert.throws(() => evaluate(form, { a: 11, b: 10 }), /范围/);
  assert.throws(() => evaluate(form, { a: 5, c: 3 }), /版本/);
  assert.throws(
    () => evaluate({ ...form, fields: [{ ...f, unseen: "forbid" }] }, { score: "unseen" }),
    /必须评分/
  );
});
test("formal public date, appearance and template caps are validated by the server", () => {
  const c = defaultJudgingConfig();
  assert.throws(() => validateConfig({ ...c, publicDay: "2026-12-15" }, false), /最早/);
  assert.throws(() => validateConfig({ ...c, publicFields: ["name", "reason"] }, false), /公开字段/);
  assert.throws(() => validateLook({ ...c.look, accent: "invalid" }), /六位色值/);
  assert.throws(() => validateRubric(c.rubrics.expert, "lecturer"), /40/);
  assert.throws(() => validateConfig({ ...c, rooms: [c.rooms[0], c.rooms[0]] }, false), /第 2 行/);
});
test("tie order uses professional, TED, audience and recorded adjudication independently of display rounding", () => {
  const c = defaultJudgingConfig(),
    state = defaultJudgingControl();
  c.display = 0;
  c.precision = 2;
  c.teachers = ["A", "B", "C", "D", "E", "F"].map((id, i): JudgingTeacher => ({
    id,
    name: id,
    orgId: id,
    org: id,
    prior: i,
    qualifierRank: 6 - i,
    photo: "",
    poster: "",
    topic: id,
    speech: id
  }));
  const ballots: BallotRecord[] = [];
  function add(id: string, role: string, score: number) {
    ballots.push({
      id: id + role,
      sessionKey: id,
      judgeKey: id + role,
      teacherKey: id,
      role,
      units: score * 100,
      status: "valid",
      createdAt: new Date()
    });
  }
  for (const [i, [p, d, t]] of [
    [36, 27, 27],
    [35, 28, 27],
    [35, 27, 28],
    [35, 27, 28],
    [35, 26, 28],
    [35, 26, 28.01]
  ].entries()) {
    const id = c.teachers[i].id;
    add(id, "lecturer", p);
    add(id, "observer", d);
    add(id, "expert", t);
  }
  state.adjustments.E = { value: 90, before: 89, reason: "复核", actor: "staff", at: "now", recheck: false };
  let rows = calculate(c, state, ballots);
  assert.equal(rows[0].id, "A");
  assert.deepEqual(rows.find((r) => r.id === "C")?.tie, ["C", "D"]);
  assert.equal(rows.find((r) => r.id === "C")?.rank, null);
  state.ties = [{ ids: ["D", "C"], reason: "查阅复赛原分", actor: "staff" }];
  rows = calculate(c, state, ballots);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["A", "D", "C", "E", "B", "F"]
  );
  const missing = calculate(
    c,
    state,
    ballots.filter((b) => !(b.teacherKey === "A" && b.role === "lecturer"))
  ).find((r) => r.id === "A")!;
  assert.equal(missing.system, null);
  assert.equal(missing.rank, null);
  assert.equal(missing.counts.professional, 0);
  assert.deepEqual([3, 4, 8, 9, 10, 11].map(awardLabels), [
    ["一等奖", "十佳教师"],
    ["二等奖", "十佳教师"],
    ["二等奖", "十佳教师"],
    ["三等奖", "十佳教师"],
    ["三等奖", "十佳教师"],
    ["三等奖"]
  ]);
});
