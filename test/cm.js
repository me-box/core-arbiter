process.env.CM_KEY = 'chrC9e52tR5ljd+02Shg6khojHNUpAhaqAplQ1jFgCw='

var supertest = require('supertest')(require('../main.js'));
var assert = require('assert');

describe('Test CM endpoints', function() {
	it('POST /cm/upsert-container-info — No API key', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.expect(401, 'Missing API key', done);
	});

	it('POST /cm/upsert-container-info — Invalid key (in header)', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.set('X-Api-Key', 'aaa')
			.expect(401, 'Unauthorized: Arbiter key invalid', done);
	});

	it('POST /cm/upsert-container-info — Invalid key (as basic auth)', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.auth('aaa')
			.expect(401, 'Unauthorized: Arbiter key invalid', done);
	});

	it('POST /cm/upsert-container-info — No data', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.expect(400, 'Missing parameters', done);
	});

	it('POST /cm/upsert-container-info — No name', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({})
			.expect(400, 'Missing parameters', done);
	});

	var testData = {
		name: 'test-store'
	};

	it('POST /cm/upsert-container-info — Minimum required', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testData)
			.expect('Content-Type', /json/)
			.expect(200, testData, done);
	});

	it('POST /cm/upsert-container-info — Upsert new data', (done) => {
		testData.nums = [ 1, 2, { half: 2.5 } ];

		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testData)
			.expect('Content-Type', /json/)
			.expect(200, testData, done);
	});

	it('POST /cm/grant-container-permissions — Grant container permissions, no route', (done) => {
		supertest
			.post('/cm/grant-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testData.name
			})
			.expect(400, 'Missing parameters', done);
	});

	it('POST /cm/grant-container-permissions — Grant container permissions, incomplete route', (done) => {
		var route = {
			target: 'b',
			path: '/some/path'
		};

		supertest
			.post('/cm/grant-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testData.name,
				route: route
			})
			.expect(400, 'Missing parameters', done);
	});

	it('POST /cm/grant-container-permissions — Grant container permissions, no caveats', (done) => {
		var route = {
			target: 'b',
			path: '/some/path',
			method: 'GET'
		};

		supertest
			.post('/cm/grant-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testData.name,
				route: route
			})
			.expect('Content-Type', /json/)
			.expect(200, [], done);
	});

	it('POST /cm/grant-container-permissions — Grant container permissions, with caveats', (done) => {
		var route = {
			target: 'b',
			path: '/some/path',
			method: 'GET'
		};

		var caveats = [ 'foo = bar', 'time < 999' ];

		supertest
			.post('/cm/grant-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testData.name,
				route: route,
				caveats: caveats
			})
			.expect('Content-Type', /json/)
			.expect(200, caveats, done);
	});

	it('POST /cm/grant-container-permissions — Grant container permissions, different path', (done) => {
		var route = {
			target: 'b',
			path: '/other/path',
			method: 'GET'
		};

		supertest
			.post('/cm/grant-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testData.name,
				route: route
			})
			.expect('Content-Type', /json/)
			.expect(200, [], done);
	});

	it('POST /cm/grant-container-permissions — Grant container permissions, different target', (done) => {
		var route = {
			target: 'a',
			path: '/some/path',
			method: 'GET'
		};

		supertest
			.post('/cm/grant-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testData.name,
				route: route
			})
			.expect('Content-Type', /json/)
			.expect(200, [], done);
	});

	it('POST /cm/grant-container-permissions — Grant container permissions, different target, wildcard', (done) => {
		var route = {
			target: 'a',
			path: '/foo/*',
			method: 'GET'
		};

		supertest
			.post('/cm/grant-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testData.name,
				route: route
			})
			.expect('Content-Type', /json/)
			.expect(200, [], done);
	});

	it('POST /cm/revoke-container-permissions — Revoke container permissions, different target, wildcard', (done) => {
		var route = {
			target: 'a',
			path: '/foo/*',
			method: 'GET'
		};

		supertest
			.post('/cm/revoke-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testData.name,
				route: route
			})
			.expect('Content-Type', /json/)
			.expect(200, null, done);
	});

	it('POST /cm/revoke-container-permissions — Revoke container permissions, single caveat', (done) => {
		var route = {
			method: 'GET',
			path: '/some/path',
			target: 'b'
		};

		var caveats = [ 'time < 999' ];

		supertest
			.post('/cm/revoke-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testData.name,
				route: route,
				caveats: caveats
			})
			.expect('Content-Type', /json/)
			.expect(200, [ 'foo = bar' ], done);
	});

	it('POST /cm/revoke-container-permissions — Revoke container permissions, revoke all', (done) => {
		var route = {
			path: '/some/path',
			method: 'GET',
			target: 'b'
		};

		supertest
			.post('/cm/revoke-container-permissions')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({
				name: testData.name,
				route: route
			})
			.expect('Content-Type', /json/)
			.expect(200, null, done);
	});

	it('POST /cm/delete-container-info — No data', (done) => {
		supertest
			.post('/cm/delete-container-info')
			.auth(process.env.CM_KEY)
			.expect(400, 'Missing parameters', done);
	});

	it('POST /cm/delete-container-info — No name', (done) => {
		supertest
			.post('/cm/delete-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({})
			.expect(400, 'Missing parameters', done);
	});

	it('POST /cm/delete-container-info — With name', (done) => {
		supertest
			.post('/cm/delete-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testData)
			.expect(200, done);
	});
});
