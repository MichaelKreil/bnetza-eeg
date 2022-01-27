"use strict"

const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const { resolve } = require('path');

const config = require('./config.js');

const maxZoomLevel = config.renderZoomLevel-5;
const size = 256;
const halfSize = size/2;
const windDirSrc = resolve(__dirname, '../cache/wind');
const tileDirSrc = resolve(__dirname, '../cache/tiles');
const tileDirDst = resolve(__dirname, '../docs/tiles');

start()

async function start() {
	let canvas = createCanvas(size,size);
	let ctx = canvas.getContext('2d');
	//ctx.globalCompositeOperation = 'copy';

	for (let zoomLevel = maxZoomLevel; zoomLevel >= 0; zoomLevel--) {
		let scale = Math.pow(2,zoomLevel);
		let tiles = new Map();

		// scan for tiles
		let zoomDirSrc = resolve(tileDirSrc, zoomLevel+1+'');
		fs.readdirSync(zoomDirSrc).forEach(y => {
			if (!/^[0-9]+$/.test(y)) return;
			y = parseInt(y, 10);
			let y0 = Math.floor(y/2);
			let rowDirSrc = resolve(zoomDirSrc, y+'');
			fs.readdirSync(rowDirSrc).forEach(filename => {
				if (!/^[0-9]+\.png$/.test(filename)) return;
				let x = parseInt(filename.slice(0,-4), 10);

				let x0 = Math.floor(x/2);
				let key = x0+'_'+y0;
				if (!tiles.has(key)) tiles.set(key, {x0,y0,children:[]});
				tiles.get(key).children.push({x,y});
			})
		})

		tiles = Array.from(tiles.values());
		for (let i = 0; i < tiles.length; i++) {
			if (i % 10 === 0) process.stderr.write(`\rlevel ${zoomLevel} - ${(100*i/tiles.length).toFixed(1)}%`);

			// init tile
			let { x0,y0,children } = tiles[i]
			ctx.fillStyle = '#fff';
			ctx.fillRect(0,0,size,size);


			for (let {x,y} of children) {
				let image = await loadImage(resolve(tileDirSrc, (zoomLevel+1)+'/'+y+'/'+x+'.png'));
				ctx.drawImage(
					image,
					0, 0, size, size,
					(x-x0*2)*halfSize, (y-y0*2)*halfSize, halfSize, halfSize,
				)
			}

			let filename

			// save base tile
			filename = resolve(tileDirSrc, zoomLevel+'/'+y0);
			fs.mkdirSync(filename, {recursive:true});
			fs.writeFileSync(resolve(filename, x0+'.png'), canvas.toBuffer('image/png'));

			// load wind data
			filename = resolve(windDirSrc, zoomLevel+'/'+y0);
			fs.mkdirSync(filename, {recursive:true});
			filename = resolve(filename, x0+'.json');

			let winds;
			if (fs.existsSync(filename)) {
				winds = JSON.parse(fs.readFileSync(filename));
			} else {

				// generate wind data
				winds = new Map();
				for (let {x,y} of children) {
					let wind = resolve(windDirSrc, (zoomLevel+1)+'/'+y+'/'+x+'.json');
					if (!fs.existsSync(wind)) continue;
					wind = JSON.parse(fs.readFileSync(wind));
					wind.forEach(w => winds.set(w.i, w));
				}
				winds = Array.from(winds.values());
				fs.writeFileSync(filename, JSON.stringify(winds));
			}

			// overlay wind dots
			winds.forEach(w => {
				let x = (w.x*scale - x0)*size;
				let y = (w.y*scale - y0)*size;
				let r = config.getWindRadius(zoomLevel);
				ctx.fillStyle = w.c;
				ctx.beginPath();
				ctx.arc(x,y,r,0,2*Math.PI);
				ctx.fill();
			})

			// save final tile
			filename = resolve(tileDirDst, zoomLevel+'/'+y0);
			fs.mkdirSync(filename, {recursive:true});
			fs.writeFileSync(resolve(filename, x0+'.png'), canvas.toBuffer('image/png'));
		}
		console.log('');
	}
}
