"use strict"

const fs = require('fs');
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

		
		p.circle = turf.circle(p.point, radius/1000);
		let gebaeudeIds = [];
		if (radius > 5) {
			let bbox = turf.bbox(p.circle);
			buildings.forEachInBBox(bbox, building => {
				if (turf.booleanIntersects(p.circle, building)) gebaeudeIds.push(building.fid);
			})
		}
		entry.properties.gebaeudeIds = gebaeudeIds;
		
		entry.geometry = p.circle.geometry;

		allResults.push(entry);
	}

	allResults = {
		type:'FeatureCollection',
		features:allResults,
	}

	console.log('allResults:', allResults.length);
	fs.writeFileSync('../data/temp/wind_data.geojson', JSON.stringify(allResults));
}
