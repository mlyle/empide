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
	feather.replace();
	console.log(Tabby);
	var tabs = new Tabby('[data-tabs]');

	import(/* webpackChunkName: "ace" */ 'ace-builds/src-min-noconflict/ace').then(module => {
		editor = ace.edit('editor');
		import(/* webpackChunkName: "ace-webpack" */ 'ace-builds/webpack-resolver').then(module => {
			editor.setTheme('ace/theme/monokai');
			editor.session.setMode('ace/mode/python');
			editor.setFontSize('16px');
		});
	});

	import(/* webpackChunkName: "xterm" */ 'xterm').then(module => {
		term = new module.Terminal();
		term.open(document.getElementById('termContainer'));
		term.onData(writeChunk);
		document.addEventListener('tabby', function (event) {
			var tab = event.target;
			console.log(tab.id);

			if (tab.id == 'tabby-toggle_terminal') {
				term.resize(80, 25);
				term.focus();
			}
		}, false);
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

	console.log("waitForText found what it wanted, remaining: " + commandData);

	console.log("preceding: " + val);

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

print('\\r\\n'.join(listdir('/')))
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
