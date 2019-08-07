// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as path from 'path';
import { SantokuAdapter } from "santoku-editor-adapter";
import { actions } from "santoku-store";
import * as vscode from 'vscode';
import { WebviewSantokuConnector } from './webview-santoku-connector';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, Santoku is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

    SantokuPanel.createOrShow(context.extensionPath);
  });
  
  let disposable2 = vscode.commands.registerCommand('extension.addSnippet', () => {
    if (SantokuPanel.currentPanel !== undefined) {
      SantokuPanel.currentPanel.doRefactor();
    }
  });

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}


/**
 * Manages react webview panels
 */
class SantokuPanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
  public static currentPanel: SantokuPanel | undefined;
  public static santokuAdapter: SantokuAdapter | undefined;

	private static readonly viewType = 'santoku';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionPath: string;
	private readonly _santokuBuildPath: string;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionPath: string) {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

		// If we already have a panel, show it.
		// Otherwise, create a new panel.
		if (SantokuPanel.currentPanel) {
			SantokuPanel.currentPanel._panel.reveal(column);
		} else {
			SantokuPanel.currentPanel = new SantokuPanel(extensionPath, column || vscode.ViewColumn.One);
		}
	}

	private constructor(extensionPath: string, column: vscode.ViewColumn) {
		this._extensionPath = extensionPath;
		this._santokuBuildPath = path.join(this._extensionPath, 'node_modules', 'santoku', 'build');

		// Create and show a new webview panel
		this._panel = vscode.window.createWebviewPanel(SantokuPanel.viewType, "React", column, {
			// Enable javascript in the webview
			enableScripts: true,

			// And restric the webview to only loading content from our extension's `media` directory.
			localResourceRoots: [
				vscode.Uri.file(this._santokuBuildPath)
			]
    });
    
    SantokuPanel.santokuAdapter = new SantokuAdapter(new WebviewSantokuConnector(this._panel.webview));
    SantokuPanel.santokuAdapter.addStateChangeListener((state) => {
      console.log(state);
    });
		
		// Set the webview's initial html content 
		this._panel.webview.html = this._getHtmlForWebview();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
	}

	public doRefactor() {
		// Send a message to the webview webview.
		// You can send any JSON serializable data.
		if (SantokuPanel.santokuAdapter !== undefined) {
      SantokuPanel.santokuAdapter.dispatch(actions.step.createStep(0));
    }
	}

	public dispose() {
		SantokuPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _getHtmlForWebview() {
		const manifest = require(path.join(this._santokuBuildPath, 'asset-manifest.json'));
		const mainScript = manifest['main.js'];
		const mainStyle = manifest['main.css'];

		const scriptPathOnDisk = vscode.Uri.file(path.join(this._santokuBuildPath, mainScript));
		const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });
		const stylePathOnDisk = vscode.Uri.file(path.join(this._santokuBuildPath, mainStyle));
		const styleUri = stylePathOnDisk.with({ scheme: 'vscode-resource' });

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
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}';style-src vscode-resource: 'unsafe-inline' http: https: data:;">
				<base href="${vscode.Uri.file(this._santokuBuildPath).with({ scheme: 'vscode-resource' })}/">
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