"use strict"

const fs = require('fs');
const zlib = require('zlib');
const turf = require('@turf/turf');

const bundeslaender = JSON.parse(zlib.brotliDecompressSync(fs.readFileSync('../data/static/bundeslaender.geojson.br')));

const cell = new Map();
const row = new Map();

module.exports = {
	findBundesland,
}

function findBundesland(point) {
	const scale = 10;

	let xi = Math.floor(point[0]*scale);
	let yi = Math.floor(point[1]*scale);

	let key = xi+'_'+yi;
	let listCell = cell.get(key);

	if (listCell === undefined) {

		let listRow = row.get(yi);
		if (listRow === undefined) {
			let bbox = [ 0, yi/scale-1e-3, 90, (yi+1)/scale+1e-3 ];
			bbox = turf.bboxPolygon(bbox);
			listRow = bundeslaender.features.map(b => turf.intersect(bbox, b, b));
			listRow = listRow.filter(b => b);
			row.set(yi, listRow);
		}

		let bbox = [ xi/scale-1e-3, yi/scale-1e-3, (xi+1)/scale+1e-3, (yi+1)/scale+1e-3 ];
		bbox = turf.bboxPolygon(bbox);
		listCell = listRow.map(b => turf.intersect(bbox, b, b));
		listCell = listCell.filter(b => b);
		cell.set(key, listCell);
	}

	listCell = listCell.filter(b => turf.booleanPointInPolygon(point, b));

	if (listCell.length === 0) return false;

	return listCell[0];
}
