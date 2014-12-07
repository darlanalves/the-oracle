/* global require, console, process */
'use strict';

var request = require('request'),
	mongoose = require('mongoose'),
	express = require('express'),

	CPF = require('./CPF'),

	baseUrl = process.env.REMOTE_URI,
	DB_URI = process.env.MONGOLAB_URI || 'mongodb://localhost/cpf',
	maxNumber = 1000000000,
	remaining = 1,
	cycleTimeout = 1,
	maxCycleTimeout = 2000;

var Profile = mongoose.model('Profile', {
	cpf: String,
	name: String,
	motherName: String,
	gender: String
});

var InvalidRecord = mongoose.model('InvalidRecord', {
	cpf: String,
	reason: String
});

function fetchData(number, callback) {
	request(baseUrl + number, function(err, response, body) {
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

		model = model.join('\n');
		makeModel(model, callback);
	});
}


function makeModel(model, callback) {
	var fn = new Function(model);

	try {
		model = fn();
	} catch (e) {
		model = {};
	}

	callback(model);
}

function main() {
	mongoose.connect(DB_URI);
	var startTime, endTime, ellapsed;

	function next() {
		var number = CPF.generate();

		startTime = new Date();
		fetchData(number, function(model) {
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

			var record;

			if (!model.name) {
				record = new InvalidRecord({
					cpf: number,
					reason: 'Name not found'
				});
				console.log(':: 404 ', number);
			} else {
				record = new Profile(model);
			}

			record.save(function(err) {
				saveOrDie(err, number, next);
			});
		});
	}

	function saveOrDie(err, number, next) {
		if (err) {
			var record = new InvalidRecord({
				cpf: number,
				reason: String(err)
			});

			console.log('>> error ', err);
			record.save(next);
			return;
		}

		remaining = maxNumber - String(number).slice(0, 9);

		if (remaining === 0) {
			mongoose.disconnect();
			process.exit(0);
		}

		console.log(':: 200', number, ', timeout = ', cycleTimeout, ', remaining = ', remaining);
		setTimeout(next, cycleTimeout);
	}

	Profile
		.find()
		.sort('-cpf')
		.limit(1)
		.exec(function(err, lastProfile) {
			if (!err && lastProfile.length) {
				var cpf = lastProfile[0].cpf.substr(0, 9);

				if (cpf > 200000) {
					console.log('Reached hard limit, exiting');
					return;
				}

				console.log('Starting at ', cpf);
				CPF.seed(cpf);
			}

			next();
		});
}

var server = express(),
	port = process.env.PORT || 5000;

server.listen(port, function() {
	console.log('Listening on port ', port, 'and runnning!');
	main();
});

server.get('/profile/:id', function(request, response) {
	Profile.findOne({
		cpf: request.params.id
	}, function(err, profile) {
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
	});
});
