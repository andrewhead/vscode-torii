# Torii: Complete, Consistent Programming Tutorials by Design

Thanks to
[`vscode-webview-react`](https://github.com/rebornix/vscode-webview-react)
for a starting point for implementing our webview.

## Development setup

This relies on the
[`santoku`](https://github.com/andrewhead/santoku) tutorial
editor package. In the future, you'll be able to "npm
install" it. For the time being, you must link to it:

```bash
npm link <path-to-santoku-repository>
```

You may also have to change directory to the santoku
directory and build its files by running:

```bash
npm run build
```

TODO(andrewhead): Eventually, we shouldn't require that
step: it should either build automatically, or be included
in the code as a submodule in a way that doesn't require
compilation.

## Features

Describe specific features of your extension including
screenshots of your extension in action. Image paths are
relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section
describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through
the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: enable/disable this extension
* `myExtension.thing`: set to `blah` to do something

## Known Issues

Calling out known issues can help limit users opening
duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

-----------------------------------------------------------------------------------------------------------

## Working with Markdown

**Note:** You can author your README using Visual Studio
Code.  Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux)
* Toggle preview (`Shift+CMD+V` on macOS or `Shift+Ctrl+V` on Windows and Linux)
* Press `Ctrl+Space` (Windows, Linux) or `Cmd+Space` (macOS) to see a list of Markdown snippets

### For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
