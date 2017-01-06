process.env.CM_KEY = 'chrC9e52tR5ljd+02Shg6khojHNUpAhaqAplQ1jFgCw='

var supertest = require('supertest')(require('../main.js'));
var assert = require('assert');

describe('Test CM endpoints', function() {
	it('GET /cm/upsert-container-info — No API key', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.expect(401, 'Missing API Key', done);
	});


	it('GET /cm/upsert-container-info — Invalid key (in header)', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.set('X-Api-Key', 'aaa')
			.expect(401, 'Unauthorized: Arbiter key invalid', done);
	});

	it('GET /cm/upsert-container-info — Invalid key (as basic auth)', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.auth('aaa')
			.expect(401, 'Unauthorized: Arbiter key invalid', done);
	});

	it('GET /cm/upsert-container-info — No data', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.expect(400, 'Missing parameters', done);
	});

	it('GET /cm/upsert-container-info — No name', (done) => {
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

	it('GET /cm/upsert-container-info — Minimum required', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testData)
			.expect('Content-Type', /json/)
			.expect(200, testData, done);
	});

	it('GET /cm/upsert-container-info — Upsert new data', (done) => {
		testData.nums = [ 1, 2, { half: 2.5 } ];

		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testData)
			.expect('Content-Type', /json/)
			.expect(200, testData, done);
	});

	it('GET /cm/delete-container-info — No data', (done) => {
		supertest
			.post('/cm/delete-container-info')
			.auth(process.env.CM_KEY)
			.expect(400, 'Missing parameters', done);
	});

	it('GET /cm/delete-container-info — No name', (done) => {
		supertest
			.post('/cm/delete-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({})
			.expect(400, 'Missing parameters', done);
	});

	it('GET /cm/delete-container-info — With name', (done) => {
		supertest
			.post('/cm/delete-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testData)
			.expect(200, done);
	});
});
