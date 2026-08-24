import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runSpinnerTask, type SpinnerHandle } from "../src/ui.js";

class RecordingSpinner implements SpinnerHandle {
  readonly messages: string[] = [];

  start(message: string): void {
    this.messages.push(`start:${message}`);
  }

  stop(message: string): void {
    this.messages.push(`stop:${message}`);
  }
}

describe("runSpinnerTask", () => {
  it("stops with the success message when the task finishes", async () => {
    const spinner = new RecordingSpinner();
    const result = await runSpinnerTask({
      spinner,
      startMessage: "Checking releases",
      successMessage: (value: number) => `Found ${value}`,
      failureMessage: "Release check failed",
      task: async () => 1,
    });

    assert.equal(result, 1);
    assert.deepEqual(spinner.messages, ["start:Checking releases", "stop:Found 1"]);
  });

  it("stops with the failure message before rethrowing an error", async () => {
    const spinner = new RecordingSpinner();
    const failure = new Error("HTTP 404");

    await assert.rejects(
      runSpinnerTask({
        spinner,
        startMessage: "Checking releases",
        successMessage: () => "Found release",
        failureMessage: "Release check failed",
        task: async () => {
          throw failure;
        },
      }),
      (error) => error === failure,
    );
    assert.deepEqual(spinner.messages, [
      "start:Checking releases",
      "stop:Release check failed",
    ]);
  });
});
