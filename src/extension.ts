import * as path from "path";
import { SantokuAdapter } from "santoku-editor-adapter";
import { CommandUpdate, OutputGenerators, readConfig } from "santoku-extension";
import { actions, InitialChunk, Selection, selectors, SourceType, State } from "santoku-store";
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
    updateOutputs(adapter);
  });

  const startCommand = vscode.commands.registerCommand("santoku.start", () => {
    SantokuPanel.createOrShow(context.extensionPath, context.globalState.get(DEBUG_MODE_KEY));
  });

  const addSnippetCommand = vscode.commands.registerCommand("santoku.addSnippet", () => {
    if (SantokuPanel.currentPanel !== undefined && SantokuPanel.santokuAdapter !== undefined) {
      const activeTextEditor = vscode.window.activeTextEditor;
      const santoku = SantokuPanel.santokuAdapter;
      const chunks: InitialChunk[] = [];
      if (activeTextEditor !== undefined) {
        const relativePath = getPathRelativeToWorkspace(activeTextEditor.document.fileName);
        if (relativePath === null) {
          return;
        }
        const state = santoku.getState();
        if (
          state === undefined ||
          !selectors.state.isPathActive(relativePath, state.undoable.present)
        ) {
          SantokuPanel.santokuAdapter.dispatch(
            actions.code.uploadFileContents(relativePath, activeTextEditor.document.getText())
          );
        }
        const selections = activeTextEditor.selections;
        for (const selection of selections) {
          const startLine = selection.start.line;
          const endLine = selection.end.line;
          const chunk: InitialChunk = {
            location: { path: relativePath, line: startLine + 1 },
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
        santoku.dispatch(actions.code.insertSnippet(santoku.getState(), ...chunks));
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
        const relativePath = getPathRelativeToWorkspace(document.fileName);
        if (relativePath === null) {
          continue;
        }
        santokuAdapter.dispatch(
          actions.code.edit(
            {
              start: { line: range.start.line + 1, character: range.start.character },
              end: { line: range.end.line + 1, character: range.end.character },
              path: relativePath,
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
  const textState = state.undoable.present;
  const activePaths = selectors.state.getActivePaths(textState);
  /*
   * TODO(andrewhead): also have to update state of an editor when it's opened.
   */
  for (const editor of vscode.window.visibleTextEditors) {
    if (!isEditorActive(editor)) {
      for (const path of activePaths) {
        const relativePath = getPathRelativeToWorkspace(editor.document.fileName);
        if (relativePath !== null && relativePath === path) {
          const newText = selectors.code.getReferenceImplementationText(textState, path);
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
    const relativePath = getPathRelativeToWorkspace(editor.document.fileName);
    /**
     * Only report selection changes from the active text editor. Assume that selections in
     * all other editors are just updating to reflect selections in an active editor. Updates
     * to the active editor from external sources are already filtered out in the
     * 'updateSelections' callback.
     */
    if (isEditorActive(editor) && relativePath !== null) {
      santokuAdapter.dispatch(
        actions.code.setSelections(
          ...event.selections.map(s => {
            return {
              anchor: { line: s.anchor.line + 1, character: s.anchor.character },
              active: { line: s.active.line + 1, character: s.active.character },
              path: relativePath,
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
    const relativePath = getPathRelativeToWorkspace(editor.document.fileName);
    /**
     * Only update selections in non-active editors. Assume for now that VSCode is a single-user
     * application; an active editor is probably generating the selections, and a non-active
     * editor should be used to mirror selections from an active editor.
     */
    if (!isEditorActive(editor) && relativePath !== null) {
      const textState = state.undoable.present;
      const selections = textState.selections
        .filter(s => s.path === relativePath)
        .map(s => {
          if (s.relativeTo.source === SourceType.REFERENCE_IMPLEMENTATION) {
            return new vscode.Selection(
              new vscode.Position(s.anchor.line - 1, s.anchor.character),
              new vscode.Position(s.active.line - 1, s.active.character)
            );
          } else if (s.relativeTo.source === SourceType.CHUNK_VERSION) {
            const chunkVersion = textState.chunkVersions.byId[s.relativeTo.chunkVersionId];
            const chunk = textState.chunks.byId[chunkVersion.chunk];
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

function updateOutputs(santokuAdapter: SantokuAdapter) {
  const pathToWorkspace = getPathToWorkspace();
  if (pathToWorkspace === null) {
    return;
  }

  const { config, error } = readConfig(pathToWorkspace);
  if (error !== null) {
    vscode.window.showErrorMessage("Error loading config: " + error);
    return;
  }

  const stagingPath = path.join(pathToWorkspace, ".staging");
  const outputGenerators = new OutputGenerators({
    configs: config.outputGenerators,
    stagePath: stagingPath
  });

  let previousState: State | undefined = undefined;
  santokuAdapter.subscribe(() => {
    const state = santokuAdapter.getState();
    const changedSnapshots = selectors.state.getChangedSnapshots(previousState, state);
    previousState = state;
    for (const snippetId of changedSnapshots) {
      if (state !== undefined) {
        const fileContents = selectors.code.getFileContents(state, snippetId);
        outputGenerators.generateOutputs({
          jobId: snippetId,
          fileContents,
          callback: onOutputUpdate.bind(null, santokuAdapter)
        });
      }
    }
  });
}

function onOutputUpdate(santokuAdapter: SantokuAdapter, update: CommandUpdate): void {
  const { jobId, commandId } = update;
  // console.log("Update:\n", JSON.stringify(update, undefined, 2));
  switch (update.state) {
    case "started":
      santokuAdapter.dispatch(actions.outputs.startExecution(jobId, commandId, update.type));
      break;
    case "running":
      santokuAdapter.dispatch(actions.outputs.updateExecution(jobId, commandId, update.log));
      break;
    case "finished":
      santokuAdapter.dispatch(
        actions.outputs.finishExecution(jobId, commandId, update.log, update.log.contents)
      );
      break;
  }
}

function getPathRelativeToWorkspace(filePath: string): string | null {
  const workspacePath = getPathToWorkspace();
  if (workspacePath === null) {
    return null;
  }
  return path.relative(workspacePath, filePath);
}

function getPathToWorkspace(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders === undefined || workspaceFolders.length === 0) {
    return null;
  }
  const rootPath = workspaceFolders[0].uri;
  if (rootPath.scheme !== "file") {
    return null;
  }
  return rootPath.fsPath;
}

// this method is called when your extension is deactivated
export function deactivate() {}
