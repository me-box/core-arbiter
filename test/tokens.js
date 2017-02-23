process.env.CM_KEY = 'chrC9e52tR5ljd+02Shg6khojHNUpAhaqAplQ1jFgCw='

var supertest = require('supertest')(require('../main.js'));
var assert = require('assert');
var macaroons = require('macaroons.js');

describe('Test token endpoint', function() {
	var testStore = {
		name: 'test-store',
		type: 'store',
		key: '8MDlgBNXfmklmQVTrJxfIwAjo8j5nIrE8aeFVIdn6Kg='
	};

	var testApp = {
		name: 'test-container',
		key:  'E3B6c+N4PxWWQGSKWM3gAFav6RWyeCYLQ+roTbPWF64='
	};

	it('POST /cm/upsert-container-info — Upsert fake store', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testStore)
			.expect('Content-Type', /json/)
			.expect(200, testStore, done);
	});

	it('POST /token — Grab token as un-upserted app', (done) => {
		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send({
				target: 'some-store'
			})
			.expect(401, 'Invalid API key', done);
	});

	it('POST /cm/upsert-container-info — Upsert fake app', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testApp)
			.expect('Content-Type', /json/)
			.expect(200, testApp, done);
	});

	it('POST /token — Grab token for incomplete route', (done) => {
		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send({
				target: 'some-store',
				path: '/some/path'
			})
			.expect(400, 'Missing parameters', done);
	});

	it('POST /token — Grab token for non-existent target', (done) => {
		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send({
				target: 'some-store',
				path: '/some/path',
				method: 'GET'
			})
			.expect(400, 'Target some-store has not been approved for arbitering', done);
	});

	it('POST /token — Grab token for unregistered target', (done) => {
		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send({
				target: testStore.name,
				path: '/some/path',
				method: 'GET'
			})
			.expect(400, 'Target ' + testStore.name + ' has not registered itself for arbitering', done);
	});

	var storeSecret;

	it('GET /store/secret — Get store secret', (done) => {
		supertest
			.get('/store/secret')
			.auth(testStore.key)
			.set('Content-Type', 'application/json')
			.send(testStore)
			.expect(function (res) {
				storeSecret = res.text;
				// TODO: Error handling
				res.text = Buffer.from(res.text, 'base64').length === 32;
			})
			.expect(200, true, done);
	});

	it('POST /cm/grant-container-permissions — Grant container permissions, no extra caveats', (done) => {
		var route = {
			target: testStore.name,
			path: '/some/path',
			method: 'GET'
		};

		supertest
			.post('/cm/grant-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testApp.name,
				route: route
			})
			.expect('Content-Type', /json/)
			.expect(200, [], done);
	});

	it('POST /token — Grab token for route with insufficient permissions (path)', (done) => {
		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send({
				target: testStore.name,
				path: '/other/path',
				method: 'GET'
			})
			.expect(401, 'Insufficient route permissions', done);
	});

	it('POST /token — Grab token for route with insufficient permissions (method)', (done) => {
		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send({
				target: testStore.name,
				path: '/some/path',
				method: 'POST'
			})
			.expect(401, 'Insufficient route permissions', done);
	});

	it('POST /token — Grab token, no extra caveats', (done) => {
		var route = {
			target: testStore.name,
			path: '/some/path',
			method: 'GET'
		};

		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send(route)
			.expect(function (res) {
				var macaroon = macaroons.MacaroonsBuilder.deserialize(res.text);
				macaroon = macaroon.inspect().split('\n');
				res.text = macaroon[2] === 'cid target = ' + route.target
				        && macaroon[3] === 'cid path = '   + route.path
				        && macaroon[4] === 'cid method = ' + route.method;
			})
			.expect(200, true, done);
	});

	it('POST /cm/grant-container-permissions — Grant container permissions, more caveats', (done) => {
		var route = {
			target: testStore.name,
			path: '/some/path',
			method: 'GET'
		};

		var caveats = [ 'foo = bar', 'time < 999' ];

		supertest
			.post('/cm/grant-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testApp.name,
				route: route,
				caveats: caveats
			})
			.expect('Content-Type', /json/)
			.expect(200, caveats, done);
	});

	it('POST /token — Grab token, extra caveats', (done) => {
		var route = {
			target: testStore.name,
			path: '/some/path',
			method: 'GET'
		};

		var caveats = [ 'foo = bar', 'time < 999' ];

		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send(route)
			.expect(function (res) {
				var macaroon = macaroons.MacaroonsBuilder.deserialize(res.text);
				macaroon = macaroon.inspect().split('\n');
				res.text = macaroon[2] === 'cid target = ' + route.target
				        && macaroon[3] === 'cid path = '   + route.path
				        && macaroon[4] === 'cid method = ' + route.method
				        && macaroon[5] === 'cid ' + caveats[0]
				        && macaroon[6] === 'cid ' + caveats[1];
			})
			.expect(200, true, done);
	});
});
