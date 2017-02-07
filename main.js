var fs = require('fs');
var https = require('https');
var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var crypto = require('crypto');
var macaroons = require('macaroons.js');
var basicAuth = require('basic-auth');
var baseCat = require('./base-cat.json');

var DEBUG = !!process.env.DEBUG;
var PORT = process.env.PORT || 8080;

var HTTPS_CLIENT_CERT = process.env.HTTPS_CLIENT_CERT || '';
var HTTPS_CLIENT_PRIVATE_KEY = process.env.HTTPS_CLIENT_PRIVATE_KEY || '';

var CM_KEY = process.env.CM_KEY || '';

var containers = {};

var app = express();

var credentials = {
	key:  HTTPS_CLIENT_PRIVATE_KEY,
	cert: HTTPS_CLIENT_CERT,
};

// TODO: Check
app.enable('trust proxy');
app.disable('x-powered-by');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: true
}));

app.get('/status', function(req, res){
	res.send('active');
});

/**********************************************************/

app.all([ '/cat', '/token', '/store/*', '/cm/*'], function (req, res, next) {
	var creds = basicAuth(req);
	var key = req.get('X-Api-Key') || (creds && creds.name);

	if (!key) {
		res.status(401).send('Missing API key');
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

app.all('/cm/*', function (req, res, next) {
	if (req.key !== CM_KEY) {
		res.status(401).send('Unauthorized: Arbiter key invalid');
		return;
	}
	next();
});

/**********************************************************/

app.post('/cm/upsert-container-info', function (req, res) {
	var data = req.body;

	if (data == null || !data.name) {
		res.status(400).send('Missing parameters');
		return;
	}

	// TODO: Store in a DB maybe? Probably not.
	if (data.type === 'store' && (!(data.name in containers) || containers[data.name].type !== 'store')) {
		containers[data.name] = {
			catItem: {
				'item-metadata': [
					{
						rel: 'urn:X-hypercat:rels:isContentType',
						val: 'application/vnd.hypercat.catalogue+json'
					},
					{
						rel: 'urn:X-hypercat:rels:hasDescription:en',
						val: data.name
					}
				],
				href: 'https://' + data.name + ':8080'
			}
		};
	} else {
		containers[data.name] = {}
	}

	// TODO: Restrict POSTed data to namespace (else can overwrite catItem)
	for(var key in data) {
		containers[data.name][key] = data[key];
	}

	res.json(containers[data.name]);
});

/**********************************************************/

app.post('/cm/delete-container-info', function (req, res) {
	var data = req.body;

	if (data == null || !data.name) {
		res.status(400).send('Missing parameters');
		return;
	}

	// TODO: Error if it wasn't there to begin with?
	delete containers[data.name];

	res.send();
});

/**********************************************************/

app.post('/cm/add-container-routes', function (req, res) {
	var data = req.body;

	// TODO: Allow all at once?
	if (data == null || !data.name || !data.target || !data.routes) {
		res.status(400).send('Missing parameters');
		return;
	}

	// TODO: Error if not yet in in records?
	var container = containers[data.name] = containers[data.name] || { name: data.name };
	container.permissions = container.permissions || {};
	container.permissions[data.target] = container.permissions[data.target] || { routes: {} };
	var routes = container.permissions[data.target].routes;

	for (method in data.routes) {
		var paths = data.routes[method];
		paths = typeof paths === 'string' ? [ paths ] : paths;
		routes[method] = routes[method] || [];
		Array.prototype.push.apply(routes[method], paths);
	}

	res.json(routes);
});

/**********************************************************/

app.post('/cm/delete-container-routes', function (req, res) {
	var data = req.body;

	if (data == null || !data.name || !data.target || !data.routes) {
		res.status(400).send('Missing parameters');
		return;
	}

	// TODO: Error if not yet in in records?
	var container = containers[data.name] = containers[data.name] || { name: data.name };
	container.permissions = container.permissions || {};
	container.permissions[data.target] = container.permissions[data.target] || { routes: {} };
	var routes = container.permissions[data.target].routes;

	for (method in data.routes) {
		var paths = data.routes[method];
		paths = typeof paths === 'string' ? [ paths ] : paths;
		routes[method] = routes[method] || [];
		routes[method] = routes[method].filter(path => !paths.includes(path));
	}

	res.json(routes);
});

/**********************************************************/

// Serve root Hypercat catalogue
app.get('/cat', function(req, res){
	var cat = JSON.parse(JSON.stringify(baseCat));

	for (var name in containers) {
		var container = containers[name];
		// TODO: If CM, show all
		// TODO: Hide items based on container permissions
		// TODO: If discoverable, but not accessible, inform as per PAS 7.3.1.2
		if(container.catItem) {
			cat.items.push(container.catItem);
		}
	}

	res.json(cat);
});

/**********************************************************/

app.post('/token', function(req, res){
	if (!req.container) {
		// NOTE: This can also happen if the CM never uploaded store key
		//       or if the CM added routes and never upserted info
		//       but should never happen if the CM is up to spec.
		res.status(401).send('Invalid API key');
		return;
	}

	if (req.body.target == null) {
		res.status(400).send('Missing parameters');
		return;
	}

	var targetContainer = containers[req.body.target];

	if (typeof(targetContainer) == "undefined" && !targetContainer) {
		res.status(400).send("Target " + req.body.target + " has not been approved for arbitering");
		return;
	}

	if (!targetContainer.secret) {
		res.status(400).send("Target " + req.body.target + " has not registered itself for arbitering");
		return;
	}

	var container = req.container;
	container.permissions = container.permissions || {};
	container.permissions[req.body.target] = container.permissions[req.body.target] || { routes: {} };
	var routes = container.permissions[req.body.target].routes;

	crypto.randomBytes(32, function(err, buffer){
		res.send(
			new macaroons.MacaroonsBuilder('http://arbiter:' + PORT, targetContainer.secret, buffer.toString('base64'))
				.add_first_party_caveat('target = ' + req.body.target)
				.add_first_party_caveat('routes = ' + JSON.stringify(routes))
				.getMacaroon().serialize()
		);
	});
});

/**********************************************************/

app.get('/store/secret', function (req, res) {
	if (!req.container) {
		// NOTE: This can also happen if the CM never uploaded store key
		//       or if the CM added routes and never upserted info
		//       but should never happen if the CM is up to spec.
		res.status(401).send('Invalid API key');
		return;
	}

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

module.exports = app;
