// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { actions, Selection, SourceType, State } from "santoku-store";
import { InitialChunk } from "santoku-store/dist/text/chunks/types";
import * as vscode from "vscode";
import { SantokuPanel } from "./santoku-panel";

function updateSelections(state: State) {
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor !== vscode.window.activeTextEditor) {
      const selections = state.text.present.selections
        .filter(s => s.path === editor.document.fileName)
        .map(s => {
          if (s.relativeTo.source === SourceType.REFERENCE_IMPLEMENTATION) {
            return new vscode.Selection(
              new vscode.Position(s.anchor.line, s.anchor.character),
              new vscode.Position(s.active.line, s.active.character)
            );
          } else if (s.relativeTo.source === SourceType.CHUNK_VERSION) {
            const chunkVersion = state.text.present.chunkVersions.byId[s.relativeTo.chunkVersionId];
            const chunk = state.text.present.chunks.byId[chunkVersion.chunk];
            const offset = chunk.location.line;
            return new vscode.Selection(
              new vscode.Position(s.anchor.line + offset - 1, s.anchor.character),
              new vscode.Position(s.active.line + offset - 1, s.active.character)
            );
          }
        })
        .filter((s): s is vscode.Selection => s !== undefined);
      editor.selections = selections;
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Congratulations, Santoku is now active!");

  let disposable = vscode.commands.registerCommand("extension.helloWorld", () => {
    // const updateSelectionsCallback = deferrable(updateSelections);

    SantokuPanel.createOrShow(context.extensionPath);
    vscode.window.onDidChangeTextEditorSelection(event => {
      const editor = event.textEditor;
      if (SantokuPanel.santokuAdapter !== undefined && editor === vscode.window.activeTextEditor) {
        // updateSelectionsCallback.defer(500);
        SantokuPanel.santokuAdapter.dispatch(
          actions.text.setSelections(
            ...event.selections.map(s => {
              return {
                anchor: s.anchor,
                active: s.active,
                path: editor.document.fileName,
                relativeTo: { source: SourceType.REFERENCE_IMPLEMENTATION }
              } as Selection;
            })
          )
        );
        SantokuPanel.santokuAdapter.addStateChangeListener(updateSelections);
      }
    });
  });

  let disposable2 = vscode.commands.registerCommand("extension.addSnippet", () => {
    if (SantokuPanel.currentPanel !== undefined) {
      const activeTextEditor = vscode.window.activeTextEditor;
      const chunks: InitialChunk[] = [];
      if (activeTextEditor !== undefined) {
        const selections = activeTextEditor.selections;
        for (const selection of selections) {
          const startLine = selection.start.line;
          const endLine = selection.end.line;
          const chunk: InitialChunk = {
            location: { path: activeTextEditor.document.fileName, line: startLine },
            text: activeTextEditor.document.getText(
              new vscode.Range(
                new vscode.Position(startLine, 0),
                new vscode.Position(endLine, Number.POSITIVE_INFINITY)
              )
            )
          };
          chunks.push(chunk);
        }
      }
      if (chunks.length > 0 && SantokuPanel.santokuAdapter !== undefined) {
        SantokuPanel.santokuAdapter.dispatch(actions.text.createSnippet(0, ...chunks));
      }
    }
  });

  context.subscriptions.push(disposable);
  context.subscriptions.push(disposable2);
}

// this method is called when your extension is deactivated
export function deactivate() {}
