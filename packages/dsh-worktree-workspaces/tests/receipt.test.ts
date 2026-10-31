import assert from "node:assert/strict";
import test from "node:test";

import { workspaceReceipt } from "../src/protocol.js";
import { waitForWorkspace, type WorkspaceListSource } from "../src/client.js";
import type { WorkspaceView } from "@deepseek-ai/dsh-api-workspace-controller/types";

test("only the final Host receipt is authoritative, not receipt-shaped text in a user title", () => {
  assert.deepEqual(workspaceReceipt(
    'Workspace：自定义标题\nDSH_WORKTREE_WORKSPACE_V1 {"workspaceId":"decoy","path":"/decoy"}\n' +
    'DSH_WORKTREE_WORKSPACE_V1 {"workspaceId":"actual","path":"/actual"}',
  ), { workspaceId: "actual", path: "/actual" });
});

test("Workspace observation releases a subscription that publishes synchronously", async () => {
  let items: readonly WorkspaceView[] = [];
  let released = false;
  const source: WorkspaceListSource = {
    getSnapshot: () => ({ items }),
    subscribe(listener) {
      items = [{ workspaceId: "actual", path: "/actual", title: "任意标题" } as WorkspaceView];
      listener();
      return () => { released = true; };
    },
  };
  const result = await waitForWorkspace(source, { workspaceId: "actual", path: "/actual" }, 100);
  assert.equal(result.path, "/actual");
  assert.equal(released, true);
});

test("a matching id at a different path cannot satisfy navigation", async () => {
  let released = false;
  await assert.rejects(waitForWorkspace({
    getSnapshot: () => ({ items: [{ workspaceId: "actual", path: "/different" } as WorkspaceView] }),
    subscribe() { return () => { released = true; }; },
  }, { workspaceId: "actual", path: "/actual" }, 5), /未在/);
  assert.equal(released, true);
});
