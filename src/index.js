'use strict';

import styles from './app'

let circuitpython = false;
let port;
let reader;
let inputDone;
let outputDone;
let inputStream;
let outputStream;
let commandBusy = 0;
let commandData = '';
let fitAddon;

let term;
let editor;
let tabs;

let modal;

import Tabby from 'tabbyjs';
import MicroModal from 'micromodal';
import minjs from 'minjs';
import FileSaver from 'file-saver';
import JSZip from 'jszip';

require('typeface-open-sans');

// XXX: favicon
// XXX: connection failure
// XXX: connection lost / retry
// XXX: files growing by a line each save/load cycle
// XXX: loading making everything "selected" in editor
// XXX: eliminate default edit document / replace with something sane.
// XXX: loading file to editor, etc, doesn't work when on terminal pane?

document.addEventListener('DOMContentLoaded', () => {
	/* Bind minjs to $ window object for ease of use. */
	window.$ = min$;

	/* Add removeAttr call to prototype because there was no way to strip attributes
	 * before.  This is necessary to re-enable disabled buttons.xi
	 */
	min$.prototype.removeAttr = function(attr){
		min$.each(this,function(el) {
			el.removeAttribute(attr);
		});
		return this;
	};

	import(/* webpackPreload: true */ /* webpackChunkName: "feather-icons" */ 'feather-icons').then(module => {
		/* Display the icons we have on our buttons */
		module.replace();

		/* Prevent drag and drop of tabs (an annoyance) */
		$('svg.tab').attr('draggable', 'false');
		$('a').attr('draggable', 'false');
	});

	MicroModal.init();

	/* Code to run when tab changes */
	document.addEventListener('tabby', function (event) {
		/* This hack is necessary because we want to style the list item,
		 * not the href in the tab like tabby-js assumes.  This is necessary
		 * because we have an input element inside the tab and it is not legal
		 * HTML to put an input inside an anchor (even though, in practice, it
		 * works).
		 */
		var tab = event.target;

		tab.parentElement.setAttribute('aria-selected', 'true');
		event.detail.previousTab.parentElement.removeAttribute('aria-selected');

		/* This hack is necessary because the terminal does not get a proper
		 * size when it is in the background.  Also, it's desirable to immediately
		 * focus the terminal when the terminal tab is selected.
		 */
		if (tab.id === 'tabby-toggle_terminal') {
			term.resize(80, 25);
			term.focus();
		}
	}, false);

	tabs = new Tabby('[data-tabs]');

	/* Prevent flash from loading tab content */
	$('.wrapper').css('opacity', '1.0');

	/* Ensure that when the input is clicked, we properly switch to the editor tab */
	var input = document.querySelector('li input');
	input.addEventListener('focus', function (event) {
		tabs.toggle('#editor');
	}, false);

	/* Hack: select the editor list item immediately */
	var editor_elem = document.querySelector('[href*="#editor"]');
	editor_elem.parentElement.setAttribute('aria-selected', 'true');

	/* Asynchronously import the ace editor and then its themes and modes */
	import(/* webpackPreload: true */ /* webpackChunkName: "ace" */ 'ace-builds/src-min-noconflict/ace').then(module => {
		editor = ace.edit('editor');
		import(/* webpackPreload: true*/ /* webpackChunkName: "ace-webpack" */ 'ace-builds/webpack-resolver').then(module => {
			import(/* webpackPreload: true*/ /* webpackChunkName: "ace-monokai" */ 'ace-builds/src-min-noconflict/theme-monokai').then(module => {
				editor.setTheme(module);
				editor.session.setMode('ace/mode/python');
				editor.setFontSize('16px');
				/* Only after all of this, should the control appear */
				$('#editor').css('opacity', '1.0');

				/* Lowest priority: Asynchronously import xterm */
				import(/* webpackPreload: true */ /* webpackChunkName: "xterm" */ 'xterm').then(module => {
					term = new module.Terminal();
					term.open(document.getElementById('termContainer'));
					term.onData(writeChunk);
				});

				/* Lowest priority: asynchronously import micropython */
				// import(/* webpackPreload: true */ /* webpackChunkName: "micropython" */ 'micropython').then(module => {
				// 	window.mp_js = module;
				// 	mp_js_stdout.addEventListener('print', function(e) {
				// 		term.write(e.data);
				// 	}, false);
				// });
			});
		});
	});

	/* Disable all buttons that depend upon an active connection */
	$('button[needs-connection]').attr('disabled', true);

	/* Set all top buttons to have a tooltip equalling their text content.  This helps when
	 * the window is narrow and the button title disappears.
	 */
	$('#buttonBar button').each(function(el,index) { el.title=el.textContent; });

	/* If the logo is clicked, show the info */
	$('.float-logo').on('click', function (event) { tabs.toggle('#info'); });

	/* Disable all buttons that depend upon an active connection */
	$('button[needs-connection]').attr('disabled', true);

	butSave.addEventListener('click', clickSave);
	butConnect.addEventListener('click', clickConnect);
	butDownload.addEventListener('click', clickDownload);
	butZip.addEventListener('click', clickZip);
	butModalOpen.addEventListener('click', completeOpening);
	butReset.addEventListener('click', clickReset);
	butInterrupt.addEventListener('click', clickInterrupt);
	butInstall.addEventListener('click', clickInstall);
	butUpload.addEventListener('click', clickUpload);

	if ('serial' in navigator) {
		//notSupported.classList.add('hidden');
	}
});

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickSave() {
	var blob = new Blob([editor.getValue()], {type: "text/plain;charset=utf-8"});
	var fileName = $('#fileName')[0].value.split("/");
	fileName = fileName[fileName.length - 1] + ".txt";

	FileSaver.saveAs(blob, fileName);
}

async function clickConnect() {
	port = await navigator.serial.requestPort();
	// - Wait for the port to open.
	await port.open({ baudRate: 115200 });

	let decoder = new TextDecoderStream();
	inputDone = port.readable.pipeTo(decoder.writable);
	inputStream = decoder.readable;

	reader = inputStream.getReader();
	readLoop();

	const encoder = new TextEncoderStream();
	outputDone = encoder.readable.pipeTo(port.writable);
	outputStream = encoder.writable;

	// pop up modal, interrupt, get version info to know whether we are on circuitpython
	MicroModal.show('modal-busy');

	await doInterrupt();

	var version = await commandGetResponse(`
try:
	from sys import implementation
	print(implementation.name)
except:
	pass
`);

	if (version.indexOf('circuitpython') !== -1) {
		circuitpython = true;
	}

	$('button[needs-connection]').removeAttr('disabled');
	$('#butConnect').attr('disabled', true);

	MicroModal.close('modal-busy');

	editor.focus();
}

async function waitForText(text) {
	// XXX timeout / fallback
	var idx = -1;

	while (idx === -1) {
		await new Promise(resolve => { setTimeout(resolve, 30);});

		idx = commandData.indexOf(text);
	}

	var val = commandData.substring(0, idx);

	commandData = commandData.substring(idx + text.length);

	/*
	console.log("waitForText found what it wanted, remaining: " + commandData);
	console.log("preceding: " + val);
	*/

	return val;
}

function chunk(arr, chunkSize) {
	var result = [];
	var nextChunk = [];

	for (var i=0, len = arr.length; i<len; i += chunkSize) {
		/* Scan to make sure that we don't end in a ', because that confuses python
		 * with our quoting.  For safety, do the same with newlines, etc. */
		for (var j = 0 ; j < 30; j++)
		{
			nextChunk = arr.slice(i, i + chunkSize + j);
			if (nextChunk[nextChunk.length-1] == "'") continue;
			if (nextChunk[nextChunk.length-1] == "\r") continue;
			if (nextChunk[nextChunk.length-1] == "\n") continue;
			break;
		}
		
		if (j != 0)
		{
			console.log("Edge case with tick at end of block, j="+j);
		}
		i += j;

		result.push(nextChunk);
	}

	return result;
}

async function commandSend(text) {
	commandBusy++;

	writeChunk('\x01')

	await waitForText('raw REPL; CTRL-B to exit');

	writeChunk(text);

	term.write('\r\n\x1B[31m');
	term.write(text.replace(/\n/g, '\r\n'));
	term.write('\x1B[0m');

	writeChunk('\x04');

	await waitForText('OK');

	commandBusy--;
}

async function commandGetResponse(text) {
	commandBusy++;

	await commandSend(text);

	var response = await waitForText('\x04');

	console.log(response);

	/* Ignore error response */
	await waitForText('\x04');

	writeChunk('\x02');

	await waitForText('>>> ');

	commandBusy--;

	return response;
}

async function getFileContents(fileName) {
	// XXX: properly escape
	var command = `
def getFile(filespec):
	with open(filespec) as reader:
		print(reader.read())

getFile('${fileName}')
`;

	var contents = await commandGetResponse(command);

	return contents;
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

	// we seem to get \r\r\n between things; so we trim
	filelist = filelist.split('\n');

	var trimmed = [];

	var idx;

	for (idx in filelist) {
		trimmed.push(filelist[idx].trim());
	}

	console.log(trimmed);

	return trimmed;
}

async function clickInterrupt() {
	// This used to send ^C twice, but that caused the target board to
	// crash occasionally.
	writeChunk('\x02\x03');

	await sleep(500);
}

async function clickDownload() {
	await clickInterrupt();

	MicroModal.show('modal-busy');

	var files = await fileList();

	var open_chooser = $('#modal-open-chooser')[0];

	while (open_chooser.length > 0) {
		open_chooser.remove(0);
	}

	var idx;

	for (idx in files) {
		var newElement = document.createElement("option");
		newElement.innerText=files[idx];
		open_chooser.append(newElement);
	}

	MicroModal.close('modal-busy');
	MicroModal.show('modal-open');
}

async function clickZip() {
	var files = await fileList();

	MicroModal.show('modal-busy');

	var zip = new JSZip();
	var idx;

	for (idx in files) {
		var fileName=files[idx];

		var contents = await getFileContents(fileName);

		if (fileName[0] == '/') {
			fileName = fileName.substring(1);
		}

		console.log(`adding [${fileName}] to ZIP`)
		zip.file(fileName, contents);
	}

	zip.forEach(function (relativePath, file){
		console.log("iterating over", relativePath);
	});

	zip.generateAsync({type:"blob"}).then(function (blob) {
        FileSaver.saveAs(blob, "empide-backup.zip");
    });

	MicroModal.close('modal-busy');
}

async function clickReset() {
	await clickInterrupt();

	var command = `
import machine
machine.reset()
`;

	commandSend(command);
}

async function clickInstall() {
	console.log("downloading defaultpackages.zip");

	var response = await fetch('defaultpackages.zip');
	console.log("Have defaultpackages.zip");

	MicroModal.show('modal-busy');

	var zip = await JSZip.loadAsync(response.blob());

	var files = [];

	zip.forEach(function (relativePath, zipEntry) {
		console.log(zipEntry.name);

		if (zipEntry.dir) {
			return;
		}

		files.push(zipEntry.name);
	});

	for (const fname of files) {
		console.log(fname);

		var contents = await zip.file(fname).async('string');

		await setFileContents(fname, contents);
	}

	await clickInterrupt();

	MicroModal.close('modal-busy');
}

async function setFileContents(fileName, contents) {
	var command = `
__chunks = 0

def __build_file_contents(chunk):
	global __chunks

	if __chunks == 0:
		mode = 'w'
	else:
		mode = 'a'

	with open('tmp_upload', mode) as writer:
		writer.write(chunk)
		__chunks += 1

def __complete_rename(file_name, expected_chunks):
	if expected_chunks == __chunks:
		import os
		os.rename('tmp_upload', file_name)
		print("Success")
	else:
		print("FAIL")
`

	await commandSend(command);

	var chunkedContent = chunk(contents, 140);

	for (var i=0; i < chunkedContent.length; i++) {
		// XXX Need to appropriately quote ''', etc.
		await commandSend(`__build_file_contents('''${chunkedContent[i]}''')\n`);
	}

	var result = await commandGetResponse(`__complete_rename('${fileName}', ${chunkedContent.length})\n`);

	console.log(result);
}

async function clickUpload() {
	// Using the modal to signal saving is a bit of a kludge, but adequate for now.
	MicroModal.show('modal-busy');

	await clickInterrupt();

	await setFileContents($('#fileName')[0].value, editor.getValue());
	MicroModal.close('modal-busy');
}

async function completeOpening() {
	var open_chooser = $('#modal-open-chooser')[0];

	var fileName = open_chooser.selectedOptions[0].text;

	var contents = await getFileContents(fileName);

	tabs.toggle('#editor');

	editor.getSession().setValue(contents);

	$('#fileName')[0].value = fileName;

	MicroModal.close('modal-open');
}

async function readLoop() {
	while (true) {
		const { value, done } = await reader.read();
		if (value) {
			if (commandBusy) {
				term.write('\x1B[32m');
			}

			term.write(value);

			if (commandBusy) {
				term.write('\x1B[0m');
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
