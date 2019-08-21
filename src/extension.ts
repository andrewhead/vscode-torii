import { actions, InitialChunk, Selection, SourceType, State } from "santoku-store";
import * as vscode from "vscode";
import { SantokuPanel } from "./santoku-panel";

export const DEBUG_MODE_KEY = "DEBUG_MODE";

export function activate(context: vscode.ExtensionContext) {
  console.log("Santoku has been activated!");

  /*
   * Inspect environment variables to decide if the extension should run in debug mode.
   */
  if (process !== undefined && process.env !== undefined) {
    context.globalState.update(DEBUG_MODE_KEY, process.env.DEBUG === "true");
  } else {
    context.globalState.update(DEBUG_MODE_KEY, false);
  }

  let startCommand = vscode.commands.registerCommand("santoku.start", () => {
    SantokuPanel.createOrShow(context.extensionPath, context.globalState.get(DEBUG_MODE_KEY));
    syncSelections();
    syncText();
  });

  let addSnippetCommand = vscode.commands.registerCommand("santoku.addSnippet", () => {
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

  context.subscriptions.push(startCommand);
  context.subscriptions.push(addSnippetCommand);
}

function isEditorActive(editor: vscode.TextEditor): boolean {
  return editor === vscode.window.activeTextEditor;
}

function isDocumentActive(document: vscode.TextDocument): boolean {
  return vscode.window.visibleTextEditors.some(editor => {
    return editor.document === document && isEditorActive(editor);
  });
}

function syncText() {
  /*
   * TODO(andrewhead): update the reference to the Santoku adapter if the panel refreshes.
   * Maybe add listeners to SantokuPanel, which forwards events from the active adapter.
   */
  if (SantokuPanel.santokuAdapter !== undefined) {
    SantokuPanel.santokuAdapter.addStateChangeListener(updateText);
  }

  vscode.workspace.onDidChangeTextDocument(event => {
    const document = event.document;
    if (SantokuPanel.santokuAdapter !== undefined && isDocumentActive(document)) {
      for (const change of event.contentChanges) {
        SantokuPanel.santokuAdapter.dispatch(
          actions.text.edit(
            {
              start: change.range.start,
              end: change.range.end,
              path: document.fileName,
              relativeTo: { source: SourceType.REFERENCE_IMPLEMENTATION }
            },
            change.text
          )
        );
      }
    }
  });
}

/**
 * TODO(andrewhead): listen for changes in state.
 */
function updateText(state: State) {
  const textState = state.text.present;
  for (const chunkId of textState.chunks.all) {
    const chunk = textState.chunks.byId[chunkId];
    const firstChunkVersion = textState.chunks.byId[chunk.versions[0]];
  }
}

function syncSelections() {
  /*
   * TODO(andrewhead): update the reference to the Santoku adapter if the panel refreshes.
   */
  if (SantokuPanel.santokuAdapter !== undefined) {
    SantokuPanel.santokuAdapter.addStateChangeListener(updateSelections);
  }

  vscode.window.onDidChangeTextEditorSelection(event => {
    const editor = event.textEditor;
    /**
     * Only report selection changes from the active text editor. Assume that selections in
     * all other editors are just updating to reflect selections in an active editor. Updates
     * to the active editor from external sources are already filtered out in the
     * 'updateSelections' callback.
     */
    if (SantokuPanel.santokuAdapter !== undefined && isEditorActive(editor)) {
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
    }
  });
}

function updateSelections(state: State) {
  for (const editor of vscode.window.visibleTextEditors) {
    /**
     * Only update selections in non-active editors. Assume for now that VSCode is a single-user
     * application; an active editor is probably generating the selections, and a non-active
     * editor should be used to mirror selections from an active editor.
     */
    if (!isEditorActive(editor)) {
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

// this method is called when your extension is deactivated
export function deactivate() {}
