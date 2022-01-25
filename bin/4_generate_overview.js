"use strict"


const maxZoomLevel = 11;
const tileDir = resolve(__dirname, '../docs/tiles');

start()

async function start() {
	for (let zoomLevel = maxZoomLevel; zoomLevel >= 0; zoomLevel--) {
		let tiles = new Map();

		let zoomDirSrc = resolve(tileDir, zoomLevel+1);
		fs.readdirSync(zoomDirSrc).forEach(y => {
			if (!/^[0-9]+$/.test(y)) return;
			y = parseInt(y, 10);
			let rowDirSrc = resolve(zoomDirSrc, y);
			fs.readdirSync(rowDirSrc).forEach(filename => {
				if (!/^[0-9]+\.png$/.test(filename)) return;
				let x = parseInt(filename.slice(0,-4), 10);
				console.log(x,y);
			})
		})
	}
}
