import { SantokuAdapter } from "santoku-editor-adapter";
import { actions, InitialChunk, Selection, SourceType, State, stateUtils } from "santoku-store";
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

  SantokuPanel.onSantokuAdapterCreated(adapter => {
    syncSelections(adapter);
    syncText(adapter);
  });

  let startCommand = vscode.commands.registerCommand("santoku.start", () => {
    SantokuPanel.createOrShow(context.extensionPath, context.globalState.get(DEBUG_MODE_KEY));
  });

  let addSnippetCommand = vscode.commands.registerCommand("santoku.addSnippet", () => {
    if (SantokuPanel.currentPanel !== undefined && SantokuPanel.santokuAdapter !== undefined) {
      const activeTextEditor = vscode.window.activeTextEditor;
      const chunks: InitialChunk[] = [];
      if (activeTextEditor !== undefined) {
        const path = activeTextEditor.document.fileName;
        const state = SantokuPanel.santokuAdapter.getState();
        if (state === undefined || !stateUtils.isPathActive(path, state.text.present)) {
          SantokuPanel.santokuAdapter.dispatch(
            actions.text.uploadFileContents(path, activeTextEditor.document.getText())
          );
        }
        const selections = activeTextEditor.selections;
        for (const selection of selections) {
          const startLine = selection.start.line;
          const endLine = selection.end.line;
          const chunk: InitialChunk = {
            location: { path: activeTextEditor.document.fileName, line: startLine + 1 },
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
      if (chunks.length > 0) {
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

function syncText(santokuAdapter: SantokuAdapter) {
  santokuAdapter.subscribe(() => {
    const state = santokuAdapter.getState();
    if (state !== undefined) {
      updateText(state);
    }
  });

  vscode.workspace.onDidChangeTextDocument(event => {
    const document = event.document;
    if (isDocumentActive(document)) {
      for (const change of event.contentChanges) {
        const range = change.range;
        santokuAdapter.dispatch(
          actions.text.edit(
            {
              start: { line: range.start.line + 1, character: range.start.character },
              end: { line: range.end.line + 1, character: range.end.character },
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

function updateText(state: State) {
  const textState = state.text.present;
  const activePaths = stateUtils.getActivePaths(textState);
  /*
   * TODO(andrewhead): also have to update state of an editor when it's opened.
   */
  for (const editor of vscode.window.visibleTextEditors) {
    if (!isEditorActive(editor)) {
      for (const path of activePaths) {
        if (editor.document.fileName === path) {
          const newText = stateUtils.getReferenceImplementationText(textState, path);
          if (newText !== editor.document.getText()) {
            /*
             * TODO(andrewhead): diff the code and apply localized edits, so the whole file
             * doesn't flicker when it changes.
             */
            editor.edit(builder => {
              builder.replace(
                new vscode.Range(
                  new vscode.Position(0, 0),
                  new vscode.Position(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
                ),
                newText
              );
            });
          }
        }
      }
    }
  }
}

function syncSelections(santokuAdapter: SantokuAdapter) {
  santokuAdapter.subscribe(() => {
    const state = santokuAdapter.getState();
    if (state !== undefined) {
      updateSelections(state);
    }
  });

  vscode.window.onDidChangeTextEditorSelection(event => {
    const editor = event.textEditor;
    /**
     * Only report selection changes from the active text editor. Assume that selections in
     * all other editors are just updating to reflect selections in an active editor. Updates
     * to the active editor from external sources are already filtered out in the
     * 'updateSelections' callback.
     */
    if (isEditorActive(editor)) {
      santokuAdapter.dispatch(
        actions.text.setSelections(
          ...event.selections.map(s => {
            return {
              anchor: { line: s.anchor.line + 1, character: s.anchor.character },
              active: { line: s.active.line + 1, character: s.active.character },
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
              new vscode.Position(s.anchor.line - 1, s.anchor.character),
              new vscode.Position(s.active.line - 1, s.active.character)
            );
          } else if (s.relativeTo.source === SourceType.CHUNK_VERSION) {
            const chunkVersion = state.text.present.chunkVersions.byId[s.relativeTo.chunkVersionId];
            const chunk = state.text.present.chunks.byId[chunkVersion.chunk];
            const offset = chunk.location.line;
            return new vscode.Selection(
              new vscode.Position(s.anchor.line - 1 + offset - 1, s.anchor.character),
              new vscode.Position(s.active.line - 1 + offset - 1, s.active.character)
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
