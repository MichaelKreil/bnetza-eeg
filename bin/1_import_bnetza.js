"use strict"

const fs = require('fs');
const { resolve } = require('path');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');


process.chdir(__dirname);

start()

function start() {
	const filename = '../data/input/Gesamtdatenexport_20220114__837270ddf17544399ae66049d12e18e0.zip';

	let zip = new AdmZip(filename);
	let zipEntries = zip.getEntries();
	zipEntries.sort((a,b) => a.header.time < b.header.time ? -1 : 1);

	zipEntries.forEach(e => {
		let entryName = e.entryName;
		let name = entryName.replace(/[_\.].*/,'');
		//if (/^(.*_1|[^_]+)\.xml/.test(entryName)) console.log(entryName);
	});
	
	let keyFilter = KeyFilter();

	convertData('Wind');
	convertData('Solar');
	convertData('Biomasse');
	convertData('GeoSolarthermieGrubenKlaerschlammDruckentspannung', 'other');
	convertData('Kernkraft');
	convertData('Verbrennung');
	convertData('Wasser');


	function convertData(einheit, nameNeu = einheit.toLowerCase()) {
		let tmpFilename = `../data/temp/tmp.tmp`;
		let resFilename = `../data/temp/${nameNeu}.geojsonl`;

		if (fs.existsSync(resFilename)) return console.log('skip', einheit);;

		console.log('start', einheit);

		let fd = fs.openSync(tmpFilename, 'w');
		let files = zipEntries.filter(e => e.entryName.startsWith('Einheiten'+einheit));

		for (let file of files) {

			console.log('   convert', file.entryName);

			let data = load(file);

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

	function load(file) {
		if (typeof file === 'string') {
			file = zipEntries.find(e => e.entryName === file);
		}

		let data = file.getData();
		if (data[0] !== 255) throw Error();
		if (data[1] !== 254) throw Error();
		data = data.slice(2);
		data = data.toString('utf16le');
		data = (new XMLParser()).parse(data);
		data = data[Object.keys(data)[0]];
		data = data[Object.keys(data)[0]];

		return data;
	}

	function KeyFilter(lookups) {
		let keys = new Map();

		let valueLookup = load('Katalogwerte.xml');
		valueLookup = new Map(valueLookup.map(v => [v.Id, v.Wert]));

		let list = fs.readFileSync('../data/static/bnetza_keys.tsv', 'utf8').split('\n');
		list.forEach(line => {
			line = line.split('\t');
			switch (line[1]) {
				case 'ignore': keys.set(line[0], false); break;
				case 'value': keys.set(line[0], true); break;
				case 'lookup': keys.set(line[0], valueLookup); break;
			}
		})

		let func = obj => {
			Object.keys(obj).forEach(key => {
				//console.log(key);
				let result = keys.get(key);

				if (result === false) {
					delete obj[key];
					return
				}

				if (result === true) return;

				if (result) {
					let v = result.get(obj[key]);
					if (!v) {
						console.log(`obj.${key} = `+JSON.stringify(obj[key]))
						func.errors = true;
					}
					obj[key] = v;
					return
				}
				
				func.errors = true;
				console.log('unknown', key, obj[key])
				return;
			})
			return obj;
		}

		return func;
	}

}