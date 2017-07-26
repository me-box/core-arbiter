var fs = require('fs');
var https = require('https');
var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var crypto = require('crypto');
var macaroons = require('macaroons.js');
var pathToRegexp = require('path-to-regexp');
var basicAuth = require('basic-auth');
var baseCat = require('./base-cat.json');
var randomstring = require('randomstring');
var base64 = require('base-64');

var PORT = process.env.PORT || 8080;

let CM_KEY = '';
let HTTPS_SECRETS = '';
let LOGSTORE_KEY = '';
let EXPORT_SERVICE_KEY = ''
let credentials = {};

try {
	//const ARBITER_KEY = process.env.ARBITER_TOKEN;
	CM_KEY = fs.readFileSync("/run/secrets/CM_KEY",{encoding:'base64'});
	LOGSTORE_KEY = fs.readFileSync("/run/secrets/DATABOX_LOGSTORE_KEY",{encoding:'base64'});
	EXPORT_SERVICE_KEY = fs.readFileSync("/run/secrets/DATABOX_EXPORT_SERVICE_KEY",{encoding:'base64'});
	
	//HTTPS certs created by the container mangers for this components HTTPS server.
	credentials = {
		key:  fs.readFileSync("/run/secrets/DATABOX_ARBITER.pem"),
		cert: fs.readFileSync("/run/secrets/DATABOX_ARBITER.pem"),
	};
} catch (e) {
	//secrets missing ;-(
	console.log("secrets missing ;-(",e);
	CM_KEY = process.env.CM_KEY || ''; //make the tests work
	HTTPS_SECRETS = '';
	LOGSTORE_KEY = '';
	EXPORT_SERVICE_KEY = ''
	credentials = {};
}

var containers = {};

//register the databox platform components
containers['container-manager'] = {};
containers['container-manager']['key'] = CM_KEY;
containers['container-manager']['name'] = 'container-manager';
containers['container-manager']['type'] = 'CM';
containers['syslog'] = {};
containers['syslog']['key'] = LOGSTORE_KEY;
containers['syslog']['name'] = 'syslog';
containers['syslog']['type'] = 'syslog';
containers['export-service'] = {};
containers['export-service']['key'] = EXPORT_SERVICE_KEY;
containers['export-service']['name'] = 'export-service';
containers['export-service']['type'] = 'export-service';

var app = express();



// TODO: Check
app.enable('trust proxy');
app.disable('x-powered-by');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: true
}));

//app.use(express.static('www'));
app.set('views', '.');
app.set('view engine', 'pug');

app.get('/status', function(req, res) {
	res.send('active');
});

app.get('/ui', function(req, res) {
	res.render('index', { containers });
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

	containers[data.name] = containers[data.name] || {};

	// TODO: Store in a DB maybe? Probably not.
	if (data.type === 'store' && containers[data.name].type !== 'store') {
		containers[data.name].catItem = {
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
		};
	}

	// TODO: Restrict POSTed data to namespace (else can overwrite catItem)
	for(var key in data)
		containers[data.name][key] = data[key];
	
	console.log("New container registered",data.name, data.key);

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

app.post('/cm/grant-container-permissions', function (req, res) {
	var data = req.body;

	// TODO: Allow all at once?
	if (data == null || !data.name || !data.route || !data.route.target || !data.route.path || !data.route.method) {
		res.status(400).send('Missing parameters');
		return;
	}

	var route = JSON.stringify({
		target: data.route.target,
		path:   data.route.path,
		method: data.route.method
	});

	var pathMapHash = JSON.stringify({
		target: data.route.target,
		method: data.route.method
	});

	// TODO: Error if not yet in in records?
	var container = containers[data.name] = containers[data.name] || { name: data.name };
	container.caveats = container.caveats || {};
	var caveats = container.caveats[route] = container.caveats[route] || [];
	// NOTE: Separate map for constant time instead of O(N)
	container.paths = container.paths || {};
	container.paths[pathMapHash] = container.paths[pathMapHash] || [];
	container.paths[pathMapHash].push({
		string: data.route.path,
		regExp: pathToRegexp(data.route.path)
	});

	if (!data.caveats) {
		res.json(caveats);
		return;
	}

	Array.prototype.push.apply(caveats, data.caveats);
	res.json(caveats);
});

/**********************************************************/

app.post('/cm/revoke-container-permissions', function (req, res) {
	var data = req.body;

	if (data == null || !data.name || !data.route || !data.route.target || !data.route.path || !data.route.method) {
		res.status(400).send('Missing parameters');
		return;
	}

	var route = JSON.stringify({
		target: data.route.target,
		path:   data.route.path,
		method: data.route.method
	});

	var pathMapHash = JSON.stringify({
		target: data.route.target,
		method: data.route.method
	});

	// TODO: Error if not yet in in records?
	var container = containers[data.name] = containers[data.name] || { name: data.name };
	container.caveats = container.caveats || {};
	container.caveats[route] = container.caveats[route] || [];
	// NOTE: Separate map for constant time instead of O(N)
	container.paths = container.paths || {};
	container.paths[pathMapHash] = container.paths[pathMapHash] || [];
	var wanted = pathToRegexp(data.route.path);
	container.paths[pathMapHash] = container.paths[pathMapHash].filter(path => !wanted.test(path.string));

	if (!data.caveats || !data.caveats.length || data.caveats.length < 1) {
		delete container.caveats[route];
		res.json(null);
		return;
	}

	res.json(container.caveats[route] = container.caveats[route].filter(caveat => !data.caveats.includes(caveat)));
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

	var data = req.body;

	if (data == null || !data.target || !data.path || !data.method) {
		res.status(400).send('Missing parameters');
		return;
	}

	var targetContainer = containers[data.target];

	if (typeof(targetContainer) == "undefined" && !targetContainer) {
		res.status(400).send("Target " + data.target + " has not been approved for arbitering");
		return;
	}

	if (!targetContainer.secret) {
		res.status(400).send("Target " + data.target + " has not registered itself for arbitering");
		return;
	}

	var route = JSON.stringify({
		target: data.target,
		path:   data.path,
		method: data.method
	});

	var pathMapHash = JSON.stringify({
		target: data.target,
		method: data.method
	});

	var container = req.container;
	container.caveats = container.caveats || {};
	container.paths = container.paths || {};
	container.paths[pathMapHash] = container.paths[pathMapHash] || [];

	if (!(route in container.caveats) && !container.paths[pathMapHash].find((path) => path.regExp.test(data.path))) {
		res.status(401).send("Insufficient route permissions");
		return;
	}

	crypto.randomBytes(32, function(err, buffer){
		// TODO: Get hostname from environment variable instead of hardcoding
		var mb = new macaroons.MacaroonsBuilder('https://arbiter:' + PORT, targetContainer.secret, buffer.toString('base64'));
		mb
			.add_first_party_caveat('target = ' + data.target)
			.add_first_party_caveat('path = ' + data.path)
			.add_first_party_caveat('method = ' + data.method);
		if (route in container.caveats)
			for (const caveat of container.caveats[route])
				mb.add_first_party_caveat(caveat);
		res.send(mb.getMacaroon().serialize());
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

	if (req.container.type !== 'store' && req.container.type !== 'export-service') {
		res.status(403).send('Container type "' + req.container.type + '" cannot use arbiter token minting capabilities as it is not a store type');
		return;
	}

	if (req.container.secret) {
		res.send(req.container.secret);
		return;
	}

        req.container.secret = new Buffer(randomstring.generate({ length: 128 })).toString('base64');
        res.send(req.container.secret);

});

console.log("starting server",credentials);
https.createServer(credentials, app).listen(PORT);

module.exports = app;
