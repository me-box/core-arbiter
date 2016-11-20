var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var crypto = require('crypto');
var macaroons = require('macaroons.js');
var ursa = require('ursa-purejs');
var baseCat = require('./base-cat.json');

var DEBUG = !!process.env.DEBUG;
var PORT = process.env.PORT || 8080;
var CM_PUB_KEY = process.env.CM_PUB_KEY || '';

var secrets = {};
var containers = {};

var app = express();

// TODO: Check
app.enable('trust proxy');
app.disable('x-powered-by');

app.use(bodyParser.urlencoded({
	extended: false
}));

app.get('/status', function(req, res){
	res.send('active');
});

app.post('/update', function(){
	var pub = CM_PUB_KEY ? ursa.createPublicKey(CM_PUB_KEY, 'base64') : null;

	if (!DEBUG && pub == null)
		console.warn('Container manager public key was not received; all update requests will be rejected!');

	if (DEBUG)
		console.warn('Arbiter running in debug mode; unsigned update requests will be accepted!');

	var screen = function (body) {
		return new Promise(function(resolve, reject){
			if (DEBUG) {
				// TODO: Handle failed parse maybe
				resolve(JSON.parse(body.data));
				return;
			}

			if (!(body != null && body.data != null && body.sig != null)) {
				reject('Missing parameters');
				return;
			}

			if (!pub.hashAndVerify('md5', body.data, new Buffer(body.sig, 'base64'))) {
				reject('Signature verification failed');
				return;
			}

			// TODO: Handle failed parse maybe
			resolve(JSON.parse(body.data));
		});
	};

	return function(req, res){
		if (!DEBUG && pub == null) {
			console.warn('Update request rejected from', req.ip);
			res.status(403).send('Update request rejected; unable to verify data due to missing public key');
			return;
		}

		screen(req.body)
			.then(function (data) {
				if (data == null || !data.name)
					throw new Error('Invalid data');
				return data;
			})
			.then(function(data){
				// TODO: Store in a DB maybe? Probably not.
				if (!(data.name in containers)) {
					containers[data.name] = {};
				}

				for(var key in data) {
					containers[data.name][key] = data[key];
				}

				res.send(JSON.stringify(containers[data.name]));
			})
			.catch(function(reason){
				console.log("Update request rejected: " + reason);
				res.status(403).send("Update request rejected: " + reason);
			});
	};
}());

app.post('/register', function(req, res){
	if (req.body.token == null) {
		res.status(400).send('Missing container token');
		return;
	}

	if (req.body.token in secrets) {
		res.status(409).send('Container already registered');
		return;
	}

	crypto.randomBytes(macaroons.MacaroonsConstants.MACAROON_SUGGESTED_SECRET_LENGTH, function(err, buffer){
		if (err != null) {
			res.status(500).send('Unable to register container (secret generation)');
			return;
		}

		secrets[req.body.token] = buffer;
		res.send(buffer.toString('base64'));
	});
});

// Serve root Hypercat catalogue
app.get('/cat', function(req, res){
	res.setHeader('Content-Type', 'application/json');
	res.send(JSON.stringify(baseCat));
});

app.post('/token', function(req, res){
	if (!(req.body.token != null && req.body.target != null)) {
		res.status(400).send('Missing parameters');
		return;
	}

	if (!(req.body.target in containers)) {
		res.status(400).send("Target " + req.body.target + " has not been approved for arbitering");
		return;
	}

	var targetToken = containers[req.body.target].token;

	if (!(targetToken in secrets)) {
		res.status(400).send("Target " + req.body.target + " has not registered itself for arbitering");
		return;
	}

	// TODO: Check permissions here!

	crypto.randomBytes(32, function(err, buffer){
		res.send(
			new macaroons.MacaroonsBuilder("http://arbiter:" + PORT, secrets[targetToken], buffer.toString('base64'))
				.add_first_party_caveat("target = " + req.body.target)
				.add_first_party_caveat('path = "/*"')
				.getMacaroon().serialize()
		);
	});
});

/*
app.post('/:driver/*', function(req, res){
  console.log("Driver: " + req.params.driver + ", IP: " + req.ip + ", Token: " + req.body.token);
  request.get("http://" + req.params.driver + ":8080/" + req.params[0]).pipe(res);
});
*/

app.listen(PORT);
