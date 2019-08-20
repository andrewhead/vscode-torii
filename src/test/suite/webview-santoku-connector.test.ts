import * as assert from "assert";
import { Message } from "santoku-editor-adapter";
import { ViewColumn, Webview, window } from "vscode";
import { generateNonce } from "../../santoku-panel";
import { WebviewSantokuConnector } from "../../webview-santoku-connector";

export function webview() {
  return window.createWebviewPanel("test", "Test", ViewColumn.One, { enableScripts: true }).webview;
}

function triggerWebviewMessage(webview: Webview, message: Message) {
  const nonce = generateNonce();
  webview.html = `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}';">
			</head>
			<body>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          vscode.postMessage(${JSON.stringify(message)});
				</script>
			</body>
			</html>`;
}

suite("WebviewSantokuConnector", () => {
  test("sends a message to the webview", () => {
    let messageSent;
    const wv = webview();
    wv.postMessage = message => {
      messageSent = message;
      return new Promise(() => {});
    };
    const connector = new WebviewSantokuConnector(wv);
    connector.sendMessage({ id: "message-id", type: "example-type", data: {} });
    assert.deepEqual(messageSent, { id: "message-id", type: "example-type", data: {} });
  });

  test("forwards messages sent from the window to subscribers", done => {
    const wv = webview();
    const listener = (message: Message) => {
      assert.strictEqual(message.type, "type");
      assert.deepStrictEqual(message.data, {});
      done();
    };
    const connector = new WebviewSantokuConnector(wv);
    connector.subscribe(listener);
    triggerWebviewMessage(wv, { id: "message-id", type: "type", data: {} });
  });
});
