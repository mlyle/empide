'use strict';

import styles from './app'

let port;
let reader;
let inputDone;
let outputDone;
let inputStream;
let outputStream;
let commandBusy = 0;
let commandData = "";
let fitAddon;

let term;
let editor;

import feather from 'feather-icons';
import Tabby from 'tabbyjs';

document.addEventListener('DOMContentLoaded', () => {
	/* Display the icons we have on our buttons */
	feather.replace();

	/* Code to run when tab changes */
	document.addEventListener('tabby', function (event) {
		/* This hack is necessary because we want to style the list item,
		 * not the href in the tab like tabby-js assumes.  This is necessary
		 * because we have an input element inside the tab and it is not legal
		 * HTML to put an input inside an anchor (even though, in practice, it
		 * works).
		 */
		tab.parentElement.setAttribute('aria-selected', 'true');
		event.detail.previousTab.parentElement.removeAttribute('aria-selected');

		/* This hack is necessary because the terminal does not get a proper
		 * size when it is in the background.  Also, it's desirable to immediately
		 * focus the terminal when the terminal tab is selected.
		 */
		if (tab.id == 'tabby-toggle_terminal') {
			term.resize(80, 25);
			term.focus();
		}
	}, false);

	var tabs = new Tabby('[data-tabs]');

	/* Ensure that when the input is clicked, we properly switch to the editor tab */
	var input = document.querySelector('li input');
	input.addEventListener("focus", function (event) {
		tabs.toggle("#editor");
	}, false);

	/* Hack: select the editor list item immediately */
	var editor = document.querySelector('[href*="#editor"]');
	editor.parentElement.setAttribute('aria-selected', 'true');

	/* Asynchronously import the ace editor and then its themes and modes */
	import(/* webpackChunkName: "ace" */ 'ace-builds/src-min-noconflict/ace').then(module => {
		editor = ace.edit('editor');
		import(/* webpackChunkName: "ace-webpack" */ 'ace-builds/webpack-resolver').then(module => {
			editor.setTheme('ace/theme/monokai');
			editor.session.setMode('ace/mode/python');
			editor.setFontSize('16px');
		});
	});

	/* Asynchronously import xterm */
	import(/* webpackChunkName: "xterm" */ 'xterm').then(module => {
		term = new module.Terminal();
		term.open(document.getElementById('termContainer'));
		term.onData(writeChunk);
	});


	butConnect.addEventListener('click', clickConnect);
	butDownload.addEventListener('click', clickDownload);

	if ('serial' in navigator) {
		//notSupported.classList.add('hidden');
	}
});

async function clickConnect() {
	port = await navigator.serial.requestPort();
	// - Wait for the port to open.
	await port.open({ baudrate: 115200 });

	let decoder = new TextDecoderStream();
	inputDone = port.readable.pipeTo(decoder.writable);
	inputStream = decoder.readable;

	reader = inputStream.getReader();
	readLoop();

	const encoder = new TextEncoderStream();
	outputDone = encoder.readable.pipeTo(port.writable);
	outputStream = encoder.writable;

	butDownload.disabled = false;
	butUpload.disabled = false;
	butConnect.disabled = true;
}

async function waitForText(text) {
	var idx = -1;

	while (idx == -1) {
		await new Promise(resolve => { setTimeout(resolve, 30);});

		idx = commandData.indexOf(text);
	}

	var val = commandData.substr(0, idx);

	commandData = commandData.substr(idx + text.length);

	/*
	console.log("waitForText found what it wanted, remaining: " + commandData);
	console.log("preceding: " + val);
	*/

	return val;
}

async function commandSend(text) {
	commandBusy++;

	writeChunk('\x01')

	await waitForText("raw REPL; CTRL-B to exit");

	writeChunk(text);

	term.write("\r\n\x1B[31m");
	term.write(text.replace(/\n/g, '\r\n'));
	term.write('\x1B[0m');

	writeChunk('\x04');

	await waitForText("OK");

	commandBusy--;
}

async function commandGetResponse(text) {
	commandBusy++;

	await commandSend(text);

	var response = await waitForText("\x04");

	console.log(response);

	/* Ignore error response */
	await waitForText("\x04");

	writeChunk("\x02");

	await waitForText(">>> ");

	commandBusy--;

	return response;
}

async function fileList() {
	const command = `
def listdir(filespec):
	import os

	result = set()

	try:
		children = os.listdir(filespec)
	except OSError:                        
		os.stat(filespec)
		result.add(filespec) 
	else:
		if children:
			for child in children:
				if filespec == '/':
					next = filespec + child
				else:
					next = filespec + '/' + child
				result.update(listdir(next))
		else:
			result.add(filespec)

	return result

print('\\r\\n'.join(listdir('/')), end='')
`;

	var filelist = await commandGetResponse(command);

	filelist = filelist.split('\r\n');

	console.log(filelist);
}

function clickDownload() {
	fileList()
}

async function readLoop() {
	while (true) {
		const { value, done } = await reader.read();
		if (value) {
			if (commandBusy) {
				term.write("\x1B[32m");
			}

			term.write(value);

			if (commandBusy) {
				term.write("\x1B[0m");
				commandData = commandData + value;
			}
		}
		if (done) {
			console.log('[readLoop] DONE', done);
			reader.releaseLock();
			break;
		}
	}
}

function writeChunk(data) {
	const writer = outputStream.getWriter();
	console.log('[SEND]', data);
	writer.write(data);
	writer.releaseLock();
}

function termData(data) {
	if (commandBusy) {
		console.log('[send] Ignored console data because command in progress');
		return;
	}

	writeChunk(data);
}
