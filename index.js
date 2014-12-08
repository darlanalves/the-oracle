/* jshint node: true */
'use strict';

var request = require('request'),
	mongoose = require('mongoose'),
	express = require('express'),
	async = require('async'),

	CPF = require('./CPF'),

	baseUrl = process.env.REMOTE_URI,
	DB_URI = process.env.MONGOLAB_URI || 'mongodb://localhost/cpf',
	offset = +process.env.OFFSET || 0,
	maxNumber = +process.env.MAX_ITERATIONS || 50000,
	remaining = 1,
	cycleTimeout = 1,
	maxCycleTimeout = process.env.MAX_TIMEOUT || 5000;

var Profile = mongoose.model('Profile', {
	cpf: String,
	name: String,
	motherName: String,
	gender: String
});

var InvalidRecord = mongoose.model('InvalidRecord', {
	cpf: String
});

mongoose.connect(DB_URI);

var startTime, endTime, ellapsed;

function next() {
	var number = CPF.generate();

	async.waterfall([
		function(cb) {
			startTime = new Date();
			fetchData(number, cb);
		},
		function(model, cb) {
			saveData(model, cb);
		}
	], function(err) {
		if (startTime) {
			endTime = new Date();
			ellapsed = endTime.getTime() - startTime.getTime();

			if (ellapsed > cycleTimeout) {
				console.log('Last query took ', ellapsed, 'ms, throttle enabled');
				cycleTimeout = ellapsed < maxCycleTimeout ? ellapsed : maxCycleTimeout;
			} else if (cycleTimeout - 100 > 0) {
				cycleTimeout -= 100;
			}
		}

		if (err) {
			console.log('>> error ', err);
		}

		remaining = maxNumber - String(number).slice(0, 9);

		if (remaining === 0) {
			mongoose.disconnect();
			process.exit(0);
		}

		setTimeout(next, cycleTimeout);
	});
}

function fetchData(number, callback) {
	request(baseUrl + number, function(err, response, body) {
		var model = parseModel(body, number);

		makeModel(model, function(model) {
			if (model.name) {
				callback(null, model);
			} else {
				callback(null, {
					cpf: number
				});
			}
		});
	});
}

function parseModel(body, number) {
	var lines = String(body).split('\n');

	lines = lines.slice(8);
	lines = lines.slice(0, 9);

	lines = lines.map(function(line) {
		line = line.replace(/\t/g, '');
		line = line.replace('parent.document.getElementById(', '');
		line = line.replace(').value=', ':');
		line = line.replace(';//', ',//');
		line = line.replace('txtnome"', 'name"');
		line = line.replace('txtnomemae"', 'motherName"');
		line = line.replace('txtDtNascimento"', 'gender"');

		return line;
	});

	lines.unshift('"cpf": "' + number + '",');

	var model = [
		'return {',
		lines[0],
		lines[1],
		lines[3],
		lines[8],
		'}'
	];

	return model.join('\n');
}

function makeModel(model, callback) {
	try {
		var fn = new Function(model);
		model = fn();
	} catch (e) {
		console.log('Parse error', model);
		model = {};
	}

	callback(model);
}

function saveData(model, callback) {
	var record;

	if (!model.name) {
		record = new InvalidRecord({
			cpf: model.cpf
		});

		console.log(':: 404 ', model.cpf);
	} else {
		record = new Profile(model);
		console.log(':: 200', model.cpf, ', timeout = ', cycleTimeout, ', remaining = ', remaining);
	}

	record.save(function(err) {
		callback(err);
	});
}

function getLastProfile(callback) {
	Profile
		.find()
		.sort('-cpf')
		.limit(1)
		.exec(function(err, result) {
			callback(err, result && result.length ? result[0] : null);
		});
}

function startFromLastProfile(lastProfile) {
	var cpf = Number(lastProfile.cpf.substr(0, 9)) + Number(offset);

	CPF.seed(cpf);
	console.log('Starting at ', cpf, 'offset = ', offset);
	next();
}

var server = express(),
	port = process.env.PORT || 5000,
	running = false;

server.listen(port, function() {
	console.log('Listening on port ', port, 'and runnning!');
});

server.get('/run', function(req, res) {
	if (running) {
		res.send(500);
		return;
	}

	getLastProfile(function(err, profile) {
		if (profile) {
			startFromLastProfile(profile);
		} else {
			next();
		}

		running = true;
		res.send(200);
	});
});

server.get('/profile/:id', function(request, response) {
	var cpf = String(request.params.id || '');

	if (cpf.length === 9) {
		cpf = CPF.createDigits(cpf);
	}

	if (!cpf) {
		response.sendStatus(400);
		return;
	}

	Profile.findOne({
		cpf: cpf
	}, function(err, profile) {
		if (!err && profile) {
			sendProfile(null, profile);
			return;
		}

		fetchData(cpf, function(err, profile) {
			if (!profile.name) {
				sendProfile(new Error());
				return;
			}

			sendProfile(null, profile);
		});
	});

	function sendProfile(err, profile) {
		if (err) {
			response.sendStatus(500);
			return;
		}

		if (!profile) {
			response.sendStatus(404);
			return;
		}

		response.json({
			cpf: profile.cpf,
			name: profile.name,
			motherName: profile.motherName,
			gender: profile.gender
		});
	}
});
