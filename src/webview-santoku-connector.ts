import { Message, SantokuConnector } from "santoku-editor-adapter";
import { Webview } from "vscode";

const setupWebviewListener = (webview: Webview) => {
  return (handleMessage: (message: Message) => void) => {
    webview.onDidReceiveMessage(message => {
      handleMessage(message);
    });
  };
};

export class WebviewSantokuConnector extends SantokuConnector {
  /**
   * @param webview a webview with Santoku pre-loaded. Assumes the editor adapter and connector
   * have already been initialized in Santoku, to enable communication. See the instructions
   * in the Santoku repository for how to load a Santoku in a web page.
   */
  constructor(webview: Webview) {
    super(setupWebviewListener(webview));
    this._webview = webview;
  }

  sendMessage(message: Message) {
    this._webview.postMessage(message);
  }

  private _webview: Webview;
}
