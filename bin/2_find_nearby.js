"use strict"

const fs = require('fs');
const { resolve } = require('path');
const child_process = require('child_process');
const turf = require('@turf/turf');
const { findBundesland } = require('../lib/bundesland.js');
const buildings = require('../lib/gebaeude.js');

start()

async function start() {
	process.chdir(__dirname);

	let entries = fs.readFileSync('../data/temp/wind.geojsonl', 'utf8')
		.split('\n')
		.filter(l => l.length > 0)
		.map(l => JSON.parse(l));

	let allResults = [];

	for (let i = 0; i < entries.length; i++) {
		//console.log(i);
		if (i % 100 === 0) process.stderr.write('\r'+(100*i/entries.length).toFixed(1)+'%')

		let entry = entries[i];
		let p = entry.properties;

		if (!p.Laengengrad || !p.Breitengrad) continue;

		p.point = [p.Laengengrad, p.Breitengrad];
		p.bundesland = findBundesland(p.point);
		if (!p.bundesland) continue;
		p.bundesland = p.bundesland.properties.GEN;
		delete p.Bundesland;

		if (!p.Nabenhoehe || !p.Rotordurchmesser) continue;

		let radius = 2;
		let hoehe = (p.Nabenhoehe + p.Rotordurchmesser/2);

		// https://www.fachagentur-windenergie.de/veroeffentlichungen/laenderinformationen/laenderinformationen-zur-windenergie/
		// https://www.fachagentur-windenergie.de/fileadmin/files/PlanungGenehmigung/FA_Wind_Abstandsempfehlungen_Laender.pdf
		switch (p.bundesland) {
			case 'Baden-Württemberg': break;
			case 'Bayern': radius = 10*hoehe; break;
			case 'Berlin': break;
			case 'Brandenburg': radius = 1000; break;
			case 'Bremen': radius = 450; break;
			case 'Hamburg': radius = 300; break;
			case 'Hessen': radius = 1000; break;
			case 'Mecklenburg-Vorpommern': radius = 800; break;
			case 'Niedersachsen': radius = 400; break;
			case 'Nordrhein-Westfalen': radius = 1000; break;
			case 'Rheinland-Pfalz': radius = 500; break;
			case 'Saarland': break;
			case 'Sachsen': break;
			case 'Sachsen-Anhalt': break;
			case 'Schleswig-Holstein': break;
			case 'Thüringen': break;
			default:
				throw Error('unknown bundesland '+p.bundesland)
		}

		
		let gebaeudeIds = [];
		if (radius > 5) {
			let circle = turf.circle(p.point, radius/1000);
			let bbox = turf.bbox(circle);
			buildings.forEachInBBox(bbox, building => {
				if (!building.properties.isWohngebaeude) return;
				if (turf.booleanIntersects(circle, building)) gebaeudeIds.push(building.fid);
			})
			entry.geometry = circle.geometry;
		}
		entry.properties.gebaeudeIds = gebaeudeIds.join(',');
		
		delete entry.properties.Bundesland
		allResults.push(entry);
	}

	allResults = {
		type:'FeatureCollection',
		features:allResults,
	}

	console.log('allResults:', allResults.features.length);

	let filenameGeoJSON = resolve(__dirname, '../data/temp/wind_data.geojson');
	let filenameGPKG = resolve(__dirname, '../data/temp/wind_data.gpkg');

	fs.writeFileSync(filenameGeoJSON, JSON.stringify(allResults));

	if (fs.existsSync(filenameGPKG)) fs.unlinkSync(filenameGPKG);
	
	child_process.spawnSync(
		'ogr2ogr',
		['-progress','-f','GPKG','-overwrite',filenameGPKG,filenameGeoJSON],
		{ stdio:'inherit' }
	)
}
