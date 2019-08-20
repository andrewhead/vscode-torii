import * as path from "path";
import { SantokuAdapter } from "santoku-editor-adapter";
import * as vscode from "vscode";
import { WebviewSantokuConnector } from "./webview-santoku-connector";

/**
 * Panel for holding the Santoku editor.
 */
export class SantokuPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: SantokuPanel | undefined;
  public static santokuAdapter: SantokuAdapter | undefined;

  private static readonly TAB_TITLE = "Document Editor";
  private static readonly VIEW_TYPE = "santoku";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _santokuAppPath: string;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionPath: string) {
    // If there's already a panel, show it. Otherwise, create a new panel.
    if (SantokuPanel.currentPanel) {
      SantokuPanel.currentPanel._panel.reveal();
    } else {
      SantokuPanel.currentPanel = new SantokuPanel(extensionPath, vscode.ViewColumn.Beside);
    }
  }

  private constructor(extensionPath: string, column: vscode.ViewColumn) {
    this._santokuAppPath = path.join(extensionPath, "node_modules", "santoku", "build");

    this._panel = vscode.window.createWebviewPanel(
      SantokuPanel.VIEW_TYPE,
      SantokuPanel.TAB_TITLE,
      column,
      {
        // Enable Javascript in the webview so Santoku code can run.
        enableScripts: true,

        // Restrict the webview to only load content from the extension's `media` directory.
        localResourceRoots: [vscode.Uri.file(this._santokuAppPath)]
      }
    );

    SantokuPanel.santokuAdapter = new SantokuAdapter(
      new WebviewSantokuConnector(this._panel.webview)
    );

    // Set the webview's initial HTML content
    this._panel.webview.html = this._getInitialHtml();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public dispose() {
    SantokuPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }

  private _getInitialHtml() {
    const manifest = require(path.join(this._santokuAppPath, "asset-manifest.json"));
    const mainScript = manifest["main.js"];
    const mainStyle = manifest["main.css"];

    const scriptPathOnDisk = vscode.Uri.file(path.join(this._santokuAppPath, mainScript));
    const scriptUri = scriptPathOnDisk.with({ scheme: "vscode-resource" });
    const stylePathOnDisk = vscode.Uri.file(path.join(this._santokuAppPath, mainStyle));
    const styleUri = stylePathOnDisk.with({ scheme: "vscode-resource" });

    // Use a nonce to whitelist which scripts can be run
    const nonce = generateNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
				<meta name="theme-color" content="#000000">
				<title>React App</title>
        <link rel="stylesheet" type="text/css" href="${styleUri}">
        <!--Use 'unsafe-eval' when debugging this extension to enable reading source maps, to make debugging easier.-->
        <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}' 'unsafe-eval';style-src vscode-resource: 'unsafe-inline' http: https: data:;">
				<base href="${vscode.Uri.file(this._santokuAppPath).with({ scheme: "vscode-resource" })}/">
			</head>
			<body>
				<noscript>You need to enable JavaScript to run this app.</noscript>
				<div id="root"></div>
				
				<script nonce="${nonce}" src="${scriptUri}"></script>
        <script nonce="${nonce}">
          <!--Open a connection from Santoku to this editor.-->
          const connector = new santoku.VsCodeWebviewEditorConnector(acquireVsCodeApi());
          const adapter = new santoku.EditorAdapter(santoku.store, connector);
				</script>
			</body>
			</html>`;
  }
}

export function generateNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
