"use strict"	

const gdal = require('gdal-next');

let dbBuildings = gdal.open('../data/temp/wind_data.gpkg').layers.get(0);

module.exports = {
	forEachInBBox,
	getAll,
}

function forEachInBBox(bbox, cb) {
	dbBuildings.setSpatialFilter(bbox[0]-1e-4, bbox[1]-1e-4,bbox[2]+1e-4, bbox[3]+1e-4);
	let feature;
	while (feature = dbBuildings.features.next()) {
		cb(getEntry(feature));
	}
}

function getAll(bbox) {
	let features = [];
	forEachInBBox(bbox, feature => features.push(feature));
	return features;
}

function getEntry(feature) {
	let entry = {
		type: 'Feature',
		fid: feature.fid,
		properties: feature.fields.toObject(),
		geometry: feature.getGeometry().toObject(),
	}
	return entry;
}
