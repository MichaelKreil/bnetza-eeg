"use strict"

const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const { resolve } = require('path');
const maxZoomLevel = 10;
const size = 256;
const halfSize = size/2;
const tileDir = resolve(__dirname, '../docs/tiles');

start()

async function start() {
	let canvas = createCanvas(size,size);
	let ctx = canvas.getContext('2d');
	//ctx.globalCompositeOperation = 'copy';

	for (let zoomLevel = maxZoomLevel; zoomLevel >= 0; zoomLevel--) {
		console.error('zoomLevel:',zoomLevel)
		let tiles = new Map();

		let zoomDirSrc = resolve(tileDir, zoomLevel+1+'');
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
			if (i % 100 === 0) process.stderr.write('\r'+(100*i/tiles.length).toFixed(1)+'%');

			let {x0,y0,children} = tiles[i]
			ctx.fillStyle = '#fff';
			ctx.fillRect(0,0,size,size);

			for (let {x,y} of children) {
				//console.error((x-x0*2)*halfSize, (y-y0*2)*halfSize);
				let filename = resolve(tileDir, (zoomLevel+1)+'/'+y+'/'+x+'.png');
				let image = await loadImage(filename);
				ctx.drawImage(
					image,
					0, 0, size, size,
					(x-x0*2)*halfSize, (y-y0*2)*halfSize, halfSize, halfSize,
				)
			}

			let filename = resolve(tileDir, zoomLevel+'/'+y0);
			fs.mkdirSync(filename, {recursive:true});
			filename = resolve(filename, x0+'.png');
			fs.writeFileSync(filename, canvas.toBuffer('image/png'));
		}
	}
}
