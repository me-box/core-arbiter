var fs = require('fs');
var https = require('https');
var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var crypto = require('crypto');
var macaroons = require('macaroons.js');
var ursa = require('ursa-purejs');
var basicAuth = require('basic-auth');
var baseCat = require('./base-cat.json');

var DEBUG = !!process.env.DEBUG;
var PORT = process.env.PORT || 8080;

var CM_PUB_KEY = process.env.CM_PUB_KEY || '';
var HTTPS_CLIENT_CERT = process.env.HTTPS_CLIENT_CERT || '';
var HTTPS_CLIENT_PRIVATE_KEY = process.env.HTTPS_CLIENT_PRIVATE_KEY || '';

var containers = {};

var app = express();

var credentials = {
	key:  HTTPS_CLIENT_PRIVATE_KEY,
	cert: HTTPS_CLIENT_CERT,
};

// TODO: Check
app.enable('trust proxy');
app.disable('x-powered-by');

app.use(bodyParser.urlencoded({
	extended: false
}));

app.get('/status', function(req, res){
	res.send('active');
});

/**********************************************************/

app.all('/cm/*', function(){
	var pub = CM_PUB_KEY ? ursa.createPublicKey(CM_PUB_KEY, 'base64') : null;

	if (!DEBUG && pub == null)
		console.warn('Container manager public key was not received; all update requests will be rejected!');

	if (DEBUG)
		console.warn('Arbiter running in debug mode; unsigned update requests will be accepted!');

	var screen = function (req) {
		return new Promise(function(resolve, reject){
			var data = req.query.data || req.body.data;
			var sig  = req.query.sig  || req.body.sig;

			if (data == null) {
				reject('Missing parameters');
				return;
			}

			if (DEBUG) {
				// TODO: Handle failed parse maybe
				resolve(JSON.parse(data));
				return;
			}

			if (sig == null) {
				reject('Missing parameters');
				return;
			}

			if (!pub.hashAndVerify('md5', data, new Buffer(sig, 'base64'))) {
				reject('Signature verification failed');
				return;
			}

			// TODO: Handle failed parse maybe
			resolve(JSON.parse(data));
		});
	};

	return function(req, res, next){
		if (!DEBUG && pub == null) {
			console.warn('Update request rejected from', req.ip);
			res.status(403).send('Update request rejected; unable to verify data due to missing public key');
			return;
		}

		screen(req)
			.then(function(data){
				req.payload = data;
				next();
			})
			.catch(function(reason){
				console.log("Update request rejected: " + reason);
				res.status(403).send("Update request rejected: " + reason);
			});
	};
}());

/**********************************************************/

app.post('/cm/upsert-container-info', function (req, res) {
	if (req.payload == null || !req.payload.name) {
		res.status(400).send('Missing parameters');
		return;
	}

	// TODO: Store in a DB maybe? Probably not.
	if (!(req.payload.name in containers))
		containers[req.payload.name] = {
			// TODO: Only add for stores
			catItem: {
				'item-metadata': [
					{
						rel: 'urn:X-hypercat:rels:isContentType',
						val: 'application/vnd.hypercat.catalogue+json'
					},
					{
						rel: 'urn:X-hypercat:rels:hasDescription:en',
						val: req.payload.name
					}
				],
				href: 'http://' + req.payload.name + ':8080'
			}
		};

	for(var key in req.payload) {
		containers[req.payload.name][key] = req.payload[key];
	}

	res.send(JSON.stringify(containers[req.payload.name]));
});

/**********************************************************/

app.all([ '/cat', '/token', '/store/*'], function (req, res, next) {
	var creds = basicAuth(req);
	var key = req.get('X-Api-Key') || (creds && creds.name);

	if (!key) {
		res.status(401).send('Missing API Key');
		return;
	}

	req.key = key;

	for (name in containers) {
		var container = containers[name];
		if (!container.key || container.key !== key)
			continue;
		req.container = container;
		break;
	}

	next();
});

/**********************************************************/

// Serve root Hypercat catalogue
app.get('/cat', function(req, res){
	var cat = JSON.parse(JSON.stringify(baseCat));

	for (name in containers) {
		var container = containers[name];
		// TODO: If CM, show all
		// TODO: Hide items based on container permissions
		// TODO: If discoverable, but not accessible, inform as per PAS 7.3.1.2
		cat.items.push(container.catItem);
	}

	res.setHeader('Content-Type', 'application/json');
	res.send(cat);
});

/**********************************************************/

app.post('/token', function(req, res){
	if (req.body.target == null) {
		res.status(400).send('Missing parameters');
		return;
	}

	var targetContainer = containers[req.body.target];

	if (targetContainer === null) {
		res.status(400).send("Target " + req.body.target + " has not been approved for arbitering");
		return;
	}

	if (!targetContainer.secret) {
		res.status(400).send("Target " + req.body.target + " has not registered itself for arbitering");
		return;
	}

	// TODO: Check permissions here!

	crypto.randomBytes(32, function(err, buffer){
		res.send(
			new macaroons.MacaroonsBuilder("http://arbiter:" + PORT, targetContainer.secret, buffer.toString('base64'))
				.add_first_party_caveat("target = " + req.body.target)
				.add_first_party_caveat('path = "/*"')
				.getMacaroon().serialize()
		);
	});
});

/**********************************************************/

app.get('/store/secret', function (req, res) {
	if (!req.container.type) {
		// NOTE: This should never happen if the CM is up to spec.
		res.status(500).send('Container type unknown by arbiter');
		return;
	}

	if (req.container.type !== 'store') {
		res.status(403).send('Container type "' + req.container.type + '" cannot use arbiter token minting capabilities as it is not a store type');
		return;
	}

	if (req.container.secret) {
		res.status(409).send('Store shared secret already retrieved');
		return;
	}

	crypto.randomBytes(macaroons.MacaroonsConstants.MACAROON_SUGGESTED_SECRET_LENGTH, function(err, buffer){
		if (err != null) {
			res.status(500).send('Unable to register container (secret generation)');
			return;
		}

		req.container.secret = buffer;
		res.send(buffer.toString('base64'));
	});
});

https.createServer(credentials, app).listen(PORT);
