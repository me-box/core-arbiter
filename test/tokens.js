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

	it('POST /token — Grab token for non-existent store', (done) => {
		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send({
				target: 'some-store'
			})
			.expect(400, 'Target some-store has not been approved for arbitering', done);
	});

	it('POST /token — Grab token for unregistered store', (done) => {
		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send({
				target: testStore.name
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

	var expected = {
		GET:  [ '/some/path' ],
		POST: [ '/a/c', '/a/b', '/a/c' ],
		ETC:  [ '/*' ]
	};

	it('POST /cm/add-container-routes — Add container routes', (done) => {
		var routes = {
			GET:  '/some/path',
			POST: [ '/a/c', '/a/b', '/a/c' ],
			ETC:  '/*'
		};

		supertest
			.post('/cm/add-container-routes')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testApp.name,
				target: testStore.name,
				routes: routes
			})
			.expect('Content-Type', /json/)
			.expect(200, expected, done);
	});

	it('POST /token — Grab token', (done) => {
		supertest
			.post('/token')
			.auth(testApp.key)
			.set('Content-Type', 'application/json')
			.send({
				target: testStore.name
			})
			.expect(function (res) {
				var macaroon = macaroons.MacaroonsBuilder.deserialize(res.text);
				macaroon = macaroon.inspect().split('\n');
				res.text = macaroon[2] === 'cid target = test-store'
				        && macaroon[3] === 'cid routes = ' + JSON.stringify(expected);
			})
			.expect(200, true, done);
	});
});
