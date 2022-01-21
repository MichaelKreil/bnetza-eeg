"use strict"

const fs = require('fs');
const { resolve } = require('path');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');


process.chdir(__dirname);


let windKeyFilter = keyFilter(
	'ClusterOstsee,Kraftwerksnummer,NetzbetreiberpruefungStatus,NetzbetreiberpruefungDatum,AnlagenbetreiberMastrNummer,Gemarkung,FlurFlurstuecknummern,StrasseNichtGefunden,Hausnummer_nv,HausnummerNichtGefunden,Ort,EinheitSystemstatus,EinheitBetriebsstatus,NichtVorhandenInMigriertenEinheiten,DatumDesBetreiberwechsels,DatumRegistrierungDesBetreiberwechsels,NameStromerzeugungseinheit,Weic_nv,Kraftwerksnummer_nv,Energietraeger,AnschlussAnHoechstOderHochSpannung,FernsteuerbarkeitNb,FernsteuerbarkeitDv,FernsteuerbarkeitDr,Einspeisungsart,GenMastrNummer,Lage,Hersteller,Technologie,Typenbezeichnung,Rotorblattenteisungssystem,AuflageAbschaltungLeistungsbegrenzung,Adresszusatz,AuflagenAbschaltungEiswurf,AuflagenAbschaltungSchallimmissionsschutzNachts,AuflagenAbschaltungSchallimmissionsschutzTagsueber,AuflagenAbschaltungSchattenwurf,AuflagenAbschaltungSonstige,AuflagenAbschaltungTierschutz,ClusterNordsee,Hausnummer,Kuestenentfernung,Seelage,Strasse,Wassertiefe,Weic,WeicDisplayName',
	'LokationMaStRNummer,EinheitMastrNummer,EegMaStRNummer,Land,Bundesland,Landkreis,Gemeinde,DatumBeginnVoruebergehendeStilllegung,Gemeindeschluessel,Postleitzahl,DatumEndgueltigeStilllegung,DatumWiederaufnahmeBetrieb,DatumLetzteAktualisierung,Laengengrad,Breitengrad,Registrierungsdatum,Inbetriebnahmedatum,Bruttoleistung,Nettonennleistung,Nabenhoehe,Rotordurchmesser,GeplantesInbetriebnahmedatum'
)

let solarKeyFilter = keyFilter(
	'Weic,Strasse,StrasseNichtGefunden,Hausnummer,Hausnummer_nv,HausnummerNichtGefunden,Ort,EinheitSystemstatus,EinheitBetriebsstatus,NichtVorhandenInMigriertenEinheiten,NameStromerzeugungseinheit,Weic_nv,Kraftwerksnummer_nv,Energietraeger,FernsteuerbarkeitNb,Einspeisungsart,ZugeordneteWirkleistungWechselrichter,GemeinsamerWechselrichterMitSpeicher,Lage,Leistungsbegrenzung,EinheitlicheAusrichtungUndNeigungswinkel,Hauptausrichtung,HauptausrichtungNeigungswinkel,Nutzungsbereich,NetzbetreiberpruefungStatus,NetzbetreiberpruefungDatum,AnlagenbetreiberMastrNummer,Adresszusatz,AnschlussAnHoechstOderHochSpannung,ArtDerFlaecheIds,DatumDesBetreiberwechsels,DatumRegistrierungDesBetreiberwechsels,Einsatzverantwortlicher,FernsteuerbarkeitDr,FernsteuerbarkeitDv,FlurFlurstuecknummern,Gemarkung,GenMastrNummer,InAnspruchGenommeneAckerflaeche,InAnspruchGenommeneFlaeche,Kraftwerksnummer,Nebenausrichtung,NebenausrichtungNeigungswinkel,WeicDisplayName',
	'LokationMaStRNummer,EinheitMastrNummer,EegMaStRNummer,Land,Bundesland,Landkreis,Gemeinde,Gemeindeschluessel,Postleitzahl,GeplantesInbetriebnahmedatum,DatumEndgueltigeStilllegung,Registrierungsdatum,Laengengrad,Breitengrad,Inbetriebnahmedatum,DatumLetzteAktualisierung,Land,Bruttoleistung,Nettonennleistung,AnzahlModule,DatumBeginnVoruebergehendeStilllegung,DatumWiederaufnahmeBetrieb'
)

start()

async function start() {
	const filename = '../data/input/Gesamtdatenexport_20220114__837270ddf17544399ae66049d12e18e0.zip';

	let zip = new AdmZip(filename);
	let zipEntries = zip.getEntries();
	zipEntries.sort((a,b) => a.header.time < b.header.time ? -1 : 1);

	//let filenames = new Map();
	zipEntries.forEach(e => {
		let name = e.entryName.replace(/[_\.].*/,'');
	//	if (!filenames.has(name)) filenames.set(name, [name, 0]);
	//	filenames.get(name)[1] += e.header.size;
	});
	//filenames = Array.from(filenames.values()).map(e => e[0]+': '+(e[1]/1048576).toFixed(0));
	//console.log(filenames.join('\n'));

	await convertData('EinheitenWind', '../data/temp/wind.geojsonl', windKeyFilter);

	await convertData('EinheitenSolar','../data/temp/solar.geojsonl', solarKeyFilter);

	async function convertData(filter, filename, cbEntry) {
		console.log('start', filter);

		let fd = fs.openSync(filename, 'w');
		let files = zipEntries.filter(e => e.entryName.startsWith(filter));

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
				cbEntry(entry);

				buffers.push(Buffer.from(JSON.stringify({
					type: 'Feature',
					geometry: { type:'Point', coordinates:[entry.Laengengrad, entry.Breitengrad]},
					properties: entry,
				})+'\n'));
			}

			fs.writeSync(fd, Buffer.concat(buffers));
		}

		console.log('finished', filter);
		fs.closeSync(fd);
	}
}

function keyFilter(keysOut, keysIn) {
	let keys = new Map();
	keysOut.split(',').forEach(k => keys.set(k,1));
	keysIn .split(',').forEach(k => keys.set(k,2));

	return obj => {
		Object.keys(obj).forEach(key => {
			let result = keys.get(key);
			
			if (!result) return console.log('unknown', key, obj[key]);
			
			if (result === 1) delete obj[key];
		})
		return obj;
	}
}
