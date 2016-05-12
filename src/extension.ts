'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocumentContentProvider, EventEmitter, Event, Uri, TextDocumentChangeEvent, TextDocument, ViewColumn } from "vscode";

const hljs = require('highlight.js');

const md = require('markdown-it')({
    html: true,
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return `<pre class="hljs"><code><div>${hljs.highlight(lang, str, true).value}</div></code></pre>`;
            } catch (error) { }
        }

        return `<pre class="hljs"><code><div>${md.utils.escapeHtml(str)}</div></code></pre>`;
    }
});

export function activate(context: vscode.ExtensionContext) {
    let provider = new MDDocumentContentProvider();
    let registration = vscode.workspace.registerTextDocumentContentProvider('markdown', provider);

    let d1 = vscode.commands.registerCommand('extension.previewMarkdown', () => openPreview());
    let d2 = vscode.commands.registerCommand('extension.previewMarkdownSide', () => openPreview(true));

    context.subscriptions.push(d1, d2, registration);

    vscode.workspace.onDidSaveTextDocument((e: TextDocument) => {
        if (isMarkdownFile(e.fileName)) {
          let markdownPreviewUri = Uri.parse(`markdown://${e.uri.path}`);
          provider.update(markdownPreviewUri);
       }
    });
    
    vscode.workspace.onDidChangeConfiguration(() => {
        vscode.workspace.textDocuments.forEach((document) => {
            if ("markdown" === document.uri.scheme) {
                provider.update(document.uri);
            } 
        });
    });
}

function isMarkdownFile(fileName: string) {
    return fileName && (fileName.endsWith('.md') 
          || fileName.endsWith('.mdown')
          || fileName.endsWith('.markdown')
          || fileName.endsWith('.markdn'));
}

function openPreview(sideBySide?: boolean): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }

    let markdownPreviewUri = Uri.parse(`markdown://${activeEditor.document.uri.path}`);
    vscode.commands.executeCommand('vscode.previewHtml', markdownPreviewUri, getViewColumn(sideBySide));
}

function getViewColumn(sideBySide): ViewColumn {
    const active = vscode.window.activeTextEditor;
    if (!active) {
        return ViewColumn.One;
    }

    if (!sideBySide) {
        return active.viewColumn;
    }

    switch (active.viewColumn) {
        case ViewColumn.One:
            return ViewColumn.Two;
        case ViewColumn.Two:
            return ViewColumn.Three;
    }

    return active.viewColumn;
}

function fixHref(resource: Uri, href: string) {
    if (href) {

        // Return early if href is already a URL
        if (Uri.parse(href).scheme) {
            return href;
        }

        // Otherwise convert to a file URI by joining the href with the resource location
        return Uri.file(path.join(path.dirname(resource.fsPath), href)).toString();
    }

    return href;
}

enum Theme {
	LIGHT,
	DARK,
	HC_BLACK
}

const LIGHT_SCROLLBAR_CSS: string = [
		'<style type="text/css">',
		'	::-webkit-scrollbar {',
		'		width: 14px;',
		'		height: 14px;',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb {',
		'		background-color: rgba(100, 100, 100, 0.4);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:hover {',
		'		background-color: rgba(100, 100, 100, 0.7);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:active {',
		'		background-color: rgba(0, 0, 0, 0.6);',
		'	}',
		'</style>'
	].join('\n');

const DARK_SCROLLBAR_CSS: string = [
		'<style type="text/css">',
		'	::-webkit-scrollbar {',
		'		width: 14px;',
		'		height: 14px;',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb {',
		'		background-color: rgba(121, 121, 121, 0.4);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:hover {',
		'		background-color: rgba(100, 100, 100, 0.7);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:active {',
		'		background-color: rgba(85, 85, 85, 0.8);',
		'	}',
		'</style>'
	].join('\n');

const HC_BLACK_SCROLLBAR_CSS: string = [
		'<style type="text/css">',
		'	::-webkit-scrollbar {',
		'		width: 14px;',
		'		height: 14px;',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb {',
		'		background-color: rgba(111, 195, 223, 0.3);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:hover {',
		'		background-color: rgba(111, 195, 223, 0.4);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:active {',
		'		background-color: rgba(111, 195, 223, 0.4);',
		'	}',
		'</style>'
	].join('\n');

class MDDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();

    public provideTextDocumentContent(uri: Uri): Thenable<string> {
        return vscode.commands.executeCommand('vscode.getBaseTheme').then((currentTheme: String) => {
            return new Promise((approve, reject) => {
                fs.readFile(uri.fsPath, (error, buffer) => {
                    if (error) {
                        return reject(error);
                    }
                    
                    const res = md.render(buffer.toString());
                    const mdStyles = vscode.workspace.getConfiguration("markdown")['styles'];
                    const theme = (currentTheme === 'vs-dark') ? Theme.DARK : (currentTheme === 'vs') ? Theme.LIGHT : Theme.HC_BLACK;

                    // Compute head
				    let head = [
					  '<!DOCTYPE html>',
					  '<html>',
					  '<head>',
					  '<meta http-equiv="Content-type" content="text/html;charset=UTF-8">',
                      `<link rel="stylesheet" type="text/css" href="${path.join(__dirname, '..', '..', 'media', 'markdown.css')}" >`,
                      `<link rel="stylesheet" type="text/css" href="${path.join(__dirname, '..', '..', 'media', 'tomorrow.css')}" >`,
                      (theme === Theme.LIGHT) ? LIGHT_SCROLLBAR_CSS : (theme === Theme.DARK) ? DARK_SCROLLBAR_CSS : HC_BLACK_SCROLLBAR_CSS,
                      mdStyles && Array.isArray(mdStyles) ? mdStyles.map((style) => {
                        return `<link rel="stylesheet" href="${fixHref(uri, style)}" type="text/css" media="screen">`;
                      }).join('\n') : '',
                      '</head>',
                      '<body>'
                    ].join('\n');
                                        
                    // Compute body
                    let body = [
                        (theme === Theme.LIGHT) ? '<div class="monaco-editor vs">' : (theme === Theme.DARK) ? '<div class="monaco-editor vs-dark">' : '<div class="monaco-editor hc-black">',
                        res,
                        '</div>',
                        `<script>
                            var electron = require("electron"); 
                            var remote = electron.remote;
                            var ipc = electron.ipcRenderer;
                            var windowId = remote.getCurrentWindow().id;
                            ipc.send('vscode:openDevTools', windowId);
                         </script>`
                    ].join('\n');

                    // Tail
                    let tail = [
                        '</body>',
                        '</html>'
                    ].join('\n');

                    approve(head + body + tail);
                });
                
            });
        });
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event; 
    }

    public update(uri: Uri) {
        this._onDidChange.fire(uri);
    }
}