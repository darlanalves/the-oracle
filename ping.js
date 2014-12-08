'use strict';
/* jshint node: true */
var request = require('request');

// ping
setInterval(function() {
	request('http://cpf-index.herokuapp.com', onError);
	request('http://cpf-alpha.herokuapp.com', onError);
	request('http://cpf-beta.herokuapp.com', onError);
}, 1000 * 60 * 20);

function onError(err) {
	console.log(err);
}
