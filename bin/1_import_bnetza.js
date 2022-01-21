"use strict"

const fs = require('fs');
const { resolve } = require('path');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');


process.chdir(__dirname);

start()

async function start() {
	const filename = '../data/input/Gesamtdatenexport_20220114__837270ddf17544399ae66049d12e18e0.zip';

	let zip = new AdmZip(filename);
	let zipEntries = zip.getEntries();
	zipEntries.sort((a,b) => a.header.time < b.header.time ? -1 : 1);

	zipEntries.forEach(e => {
		let entryName = e.entryName;
		let name = entryName.replace(/[_\.].*/,'');
		//if (/^(.*_1|[^_]+)\.xml/.test(entryName)) console.log(entryName);
	});

	await convertData('Wind');
	await convertData('Solar');
	await convertData('Biomasse');
	await convertData('GeoSolarthermieGrubenKlaerschlammDruckentspannung', 'other');
	await convertData('Kernkraft');
	await convertData('Verbrennung');
	await convertData('Wasser');





	async function convertData(einheit, nameNeu = einheit) {
		let tmpFilename = `../data/temp/tmp.tmp`;
		let resFilename = `../data/temp/${einheit.toLowerCase()}.geojsonl`;

		if (fs.existsSync(resFilename)) return console.log('skip', einheit);;

		console.log('start', einheit);

		let keyFilter = KeyFilter();

		let fd = fs.openSync(tmpFilename, 'w');
		let files = zipEntries.filter(e => e.entryName.startsWith('Einheiten'+einheit));

		for (let file of files) {

			console.log('   convert', file.entryName);

			let data = file.getData();
			if (data[0] !== 255) throw Error();
			if (data[1] !== 254) throw Error();
			data = data.slice(2);
			data = data.toString('utf16le');
			data = (new XMLParser()).parse(data);

			data = data[Object.keys(data)[0]];
			data = data[Object.keys(data)[0]];

			let buffers = [];

			for (let entry of data) {
				keyFilter(entry);

				buffers.push(Buffer.from(JSON.stringify({
					type: 'Feature',
					geometry: { type:'Point', coordinates:[entry.Laengengrad, entry.Breitengrad]},
					properties: entry,
				})+'\n'));
			}

			fs.writeSync(fd, Buffer.concat(buffers));
		}

		console.log('finished', einheit);
		fs.closeSync(fd);

		if (keyFilter.errors) process.exit();

		fs.renameSync(tmpFilename, resFilename);
	}
}

function KeyFilter() {
	let keys = new Map();

	let list = fs.readFileSync('../data/static/bnetza_keys.txt', 'utf8');
	list = list.split(/-+/);
	if (list.length !== 2) throw Error();
	list[0].split('\n').forEach(k => keys.set(k,1));
	list[1].split('\n').forEach(k => keys.set(k,2));

	let func = obj => {
		Object.keys(obj).forEach(key => {
			let result = keys.get(key);
			
			if (!result) {
				func.errors = true;
				console.log('unknown', key, obj[key])
				return;
			}
			
			if (result === 1) delete obj[key];
		})
		return obj;
	}

	return func;
}
