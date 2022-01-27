"use strict"

const cluster = require('cluster');

module.exports = {
	simpleCluster,
	forParallel,
}


function simpleCluster(main, worker, singleThread) {
	if (singleThread) return main(worker);
	
	if (cluster.isMaster) {
		main(function (...args) {
			args = JSON.stringify(args);
			return new Promise(res => {
				let worker = cluster.fork();
				worker.on('online', () => worker.send(args))
				worker.on('message', message => res(JSON.parse(message)));
			})
		})
	} else if (cluster.isWorker) {
		process.on('message', async message => {
			message = JSON.parse(message);
			let result = await worker(...message);
			result = JSON.stringify(result || 0);
			process.send(result, () => process.exit());
		})
	}
}

function forParallel(list, max, cb) {
	return new Promise((res, rej) => {
		let running = 0, index = 0, finished = false;

		start();

		function start() {
			if (finished) return;
			if (running >= max) return;
			if (index >= list.length) {
				if (running === 0) {
					finished = true;
					res();
					return
				}
				return
			}
			running++;
			let nextIndex = index++;
			cb(list[nextIndex], nextIndex)
				.then(() => {
					running--;
					process.nextTick(start);
				})
				.catch(err => {
					finished = true;
					rej(err);
				})
			if (running < max) process.nextTick(start);
		}
	})
}
