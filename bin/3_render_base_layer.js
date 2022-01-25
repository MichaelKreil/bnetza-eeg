"use strict"

const fs = require('fs');
const zlib = require('zlib');
const os = require('os');
const { resolve } = require('path');
const { forParallel, simpleCluster } = require('../lib/helper.js');
const { colors, renderZoomLevel } = require('./config.js');


const bboxGermany = [5.9, 47.3, 15.1, 55.0]; // Deutschland
//const bboxGermany = [8.977, 47.270, 13.836, 50.565]; // Bayern
//const bboxGermany = [13.091, 52.334, 13.743, 52.677]; // Berlin
const zoomLevelScale = Math.pow(2, renderZoomLevel);
const tileSize = 256;
const tileCount = 16;
const workerCount = (os.type() === 'Darwin') ? 1 : os.cpus().length;

const mercator = {
	x: v => (v+180)/360,
	y: v => 0.5*(1-Math.log(Math.tan(Math.PI*(1+v/90)/4))/Math.PI),
}

const demercator = {
	x: v => v*360-180,
	y: v => (Math.atan(Math.exp((1-v*2)*Math.PI))*4/Math.PI-1)*90,
}


simpleCluster(async worker => {
	const turf = require('@turf/turf');

	let bboxTilesGermany = [
		Math.floor(mercator.x(bboxGermany[0])*zoomLevelScale/tileCount),
		Math.floor(mercator.y(bboxGermany[3])*zoomLevelScale/tileCount),
		Math.ceil( mercator.x(bboxGermany[2])*zoomLevelScale/tileCount),
		Math.ceil( mercator.y(bboxGermany[1])*zoomLevelScale/tileCount),
	]

	let todos = [];
	for (let y = bboxTilesGermany[3]; y >= bboxTilesGermany[1]; y--) {
		for (let x = bboxTilesGermany[0]; x <= bboxTilesGermany[2]; x++) {
			todos.push({x,y});
		}
	}
	console.log('todos', todos.length);
	//todos = todos.slice(14007);

	const buildingDB = require('../lib/gebaeude.js');
	const windDB = require('../lib/wind.js');

	await forParallel(todos, workerCount, async (todo, i) => {
		process.stderr.write('\r'+(100*i/todos.length).toFixed(2)+'%');

		let dataFolder = resolve(__dirname, '../cache/geometry/'+todo.y);
		fs.mkdirSync(dataFolder, {recursive:true});
		let dataFilename = resolve(dataFolder, todo.x+'.json.gz');

		if (!fs.existsSync(dataFilename)) {
			let bboxTiles = [
				 todo.x*tileCount,
				 todo.y*tileCount,
				(todo.x+1)*tileCount,
				(todo.y+1)*tileCount,
			]
			let bboxCoord = [
				demercator.x(bboxTiles[0]/zoomLevelScale),
				demercator.y(bboxTiles[3]/zoomLevelScale),
				demercator.x(bboxTiles[2]/zoomLevelScale),
				demercator.y(bboxTiles[1]/zoomLevelScale),
			]

			let data = {
				buildings: buildingDB.getAll(bboxCoord),
				winds: windDB.getAll(bboxCoord),
				x: todo.x,
				y: todo.y,
			}
			data = Buffer.from(JSON.stringify(data));
			data = await new Promise(res => zlib.gzip(data, (a,b) => res(b)));
			fs.writeFileSync(dataFilename, data);
		}

		let zoom = renderZoomLevel - Math.round(Math.log2(tileCount));
		let tileFilename = resolve(__dirname, '../docs/tiles/'+zoom+'/'+todo.y+'/'+todo.x+'.png');

		if (fs.existsSync(tileFilename)) return;

		await worker(dataFilename)
	})
}, async filename => {
	let todo = fs.readFileSync(filename);
	todo = zlib.gunzipSync(todo);
	todo = JSON.parse(todo);

	if ((todo.buildings.length === 0) && (todo.winds.length === 0)) return;

	const { createCanvas } = require('canvas');

	let size = tileSize*tileCount;
	let canvas = createCanvas(size, size)
	let ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff';
	ctx.fillRect(0,0,size,size);

	let buildingIds = new Set();
	todo.winds.forEach(feature => {
		feature.gebaeudeIds = [];
		if (feature.geometry.type === 'Point') return;
		if (feature.properties.gebaeudeIds.length > 3) {
			feature.gebaeudeIds = feature.properties.gebaeudeIds.split(',').map(id => parseInt(id, 10));
		}
		feature.gebaeudeIds.forEach(id => buildingIds.add(id));
	});
	todo.winds.sort((a,b) => a.gebaeudeIds.length - b.gebaeudeIds.length)
	todo.winds.forEach(feature => {
		if (feature.geometry.type === 'Point') return;
		ctx.fillStyle = (feature.gebaeudeIds.length > 0) ? colors.windAreaHit : colors.windArea;
		ctx.beginPath();
		drawArea(feature.geometry);
		ctx.fill();
	})

	todo.buildings.forEach(building => {
		if (building.properties.isWohngebaeude) {
			if (buildingIds.has(building.fid)) {
				ctx.fillStyle = colors.wohnhausHit;
			} else {
				ctx.fillStyle = colors.wohnhaus;
			}
		} else {
			ctx.fillStyle = colors.nichtWohnhaus;
		}
		
		ctx.beginPath();
		drawArea(building.geometry);
		ctx.fill();
	})

	let canvasTile = createCanvas(tileSize, tileSize);
	let ctxTile = canvasTile.getContext('2d');
	ctxTile.globalCompositeOperation = 'copy';

	todo.winds.forEach(feature => {
		feature.x = (mercator.x(feature.properties.Laengengrad)*zoomLevelScale - todo.x*tileCount)*tileSize;
		feature.y = (mercator.y(feature.properties.Breitengrad)*zoomLevelScale - todo.y*tileCount)*tileSize;
		feature.c = (feature.gebaeudeIds.length > 0) ? colors.windDotHit : colors.windDot;
	})

	let zoom = renderZoomLevel;
	for (let count = tileCount; count >= 1; count /= 2) {
		let scale = tileCount/count;
		for (let yi = 0; yi < count; yi++) {
			let folder = resolve(__dirname, '../docs/tiles/'+zoom+'/'+(todo.y*count+yi));
			fs.mkdirSync(folder, {recursive:true});
			for (let xi = 0; xi < count; xi++) {
				ctxTile.drawImage(
					canvas,
					xi*tileSize*scale, yi*tileSize*scale, tileSize*scale, tileSize*scale,
					0, 0, tileSize, tileSize,
				)

				if (count === 1) {
					// save baselayer background
					let dataFolder = resolve(__dirname, '../cache/tiles/'+todo.y);
					fs.mkdirSync(dataFolder, {recursive:true});

					let buffer = canvasTile.toBuffer('image/png');
					if (buffer.length <= 872) continue;

					let filenamePng = resolve(dataFolder, (todo.x*count+xi)+'.png');
					fs.writeFileSync(filenamePng, buffer);
				}

				// overlay wind dots
				todo.winds.forEach(feature => {
					let x = feature.x/scale - xi*tileSize;
					let y = feature.y/scale - yi*tileSize;
					ctx.fillStyle = feature.c;
					ctx.beginPath();
					ctx.arc(x,y,5,0,2*Math.PI);
					ctx.fill();
				})
				
				// save tile
				let buffer = canvasTile.toBuffer('image/png');
				if (buffer.length <= 872) continue;

				let filenamePng = resolve(folder, (todo.x*count+xi)+'.png');
				fs.writeFileSync(filenamePng, buffer);
			}
		}
		zoom--;
	}

	function drawArea(geometry) {
		switch (geometry.type) {
			case 'MultiPolygon': drawRec(2, geometry.coordinates); break;
			case 'Polygon': drawRec(1, geometry.coordinates); break;
			default:
				throw Error(geometry.type);
		}

		function drawRec(depth, data) {
			if (depth > 0) {
				data.forEach(e => drawRec(depth-1, e));
				return;
			}

			data.forEach((point,i) => {
				let x = (mercator.x(point[0])*zoomLevelScale - todo.x*tileCount)*tileSize;
				let y = (mercator.y(point[1])*zoomLevelScale - todo.y*tileCount)*tileSize;
				//console.log(x,y);
				if (i === 0) {
					ctx.moveTo(x,y);
				} else {
					ctx.lineTo(x,y);
				}
			})
		}
	}
}, workerCount === 1)
