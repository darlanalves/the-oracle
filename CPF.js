'use strict';

function getSumThroughPosition(identity, position) {
	var sum = 0,
		k = position + 2;

	for (var i = 1; i <= position; i++) {
		sum += parseInt(identity.charAt(i - 1)) * (k - i);
	}

	return sum;
}

function checkModulusAtPosition(identity, mod, position) {
	return mod === parseInt(identity.charAt(position));
}

function getModulusForSum(sum) {
	var mod = (sum * 10) % 11;

	if (mod === 10 || mod === 11) {
		mod = 0;
	}

	return mod;
}

/**
 * Validates a given users' "CPF" code
 * @param {String} identity
 */
function validateCPF(identity) {
	identity = String(identity).replace(/\D+/g, '');

	// the code '00000000000' would pass, but it's invalid
	if (identity.length !== 11 || identity === '00000000000') {
		return false;
	}

	var mod, sum;

	sum = getSumThroughPosition(identity, 9);
	mod = getModulusForSum(sum);
	if (!checkModulusAtPosition(identity, mod, 9)) {
		return false;
	}

	sum = getSumThroughPosition(identity, 10);
	mod = getModulusForSum(sum);
	if (!checkModulusAtPosition(identity, mod, 10)) {
		return false;
	}

	return true;
}

var leftPadding = '000000000';

function leftPadZeros(string) {
	string = String(string);

	if (string.length >= 9) return string;

	var size = 9 - string.length;

	return leftPadding.substr(0, size) + string;
}

var $$uid = 1;

function generate() {
	var identity = leftPadZeros($$uid++);

	return fillDigits(identity);
}

function fillDigits(identity) {
	var sum;

	sum = getSumThroughPosition(identity, 9);
	identity += getModulusForSum(sum);

	sum = getSumThroughPosition(identity, 10);
	identity += getModulusForSum(sum);

	return identity;
}

function seed(seedId) {
	$$uid = +seedId || 1;
}

module.exports = {
	check: validateCPF,
	generate: generate,
	createDigits: fillDigits,
	seed: seed
};
