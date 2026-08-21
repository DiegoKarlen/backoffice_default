import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LiveDrawMutex } from "../../../src/game-engine/bingo/live-draw-mutex.js";

describe("LiveDrawMutex", () => {
  it("runs tasks sequentially", async () => {
    const mutex = new LiveDrawMutex();
    const order: number[] = [];

    await Promise.all([
      mutex.runExclusive(async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 30));
        order.push(2);
      }),
      mutex.runExclusive(async () => {
        order.push(3);
      }),
    ]);

    assert.deepEqual(order, [1, 2, 3]);
  });
});
