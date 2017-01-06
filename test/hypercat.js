process.env.CM_KEY = 'chrC9e52tR5ljd+02Shg6khojHNUpAhaqAplQ1jFgCw='

var supertest = require('supertest')(require('../main.js'));
var assert = require('assert');
var cat = JSON.parse(JSON.stringify(require('../base-cat.json')));

describe('Test top-level root catalogue', function() {
	it('GET /cat — Empty', (done) => {
		supertest
			.get('/cat')
			.auth(process.env.CM_KEY)
			.expect('Content-Type', /json/)
			.expect(200, cat, done);
	});

	var testStore = {
		name: 'test-store',
		foo: 'bar'
	};

	it('GET /cm/upsert-container-info — Register non-store', (done) => {
		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testStore)
			.expect('Content-Type', /json/)
			.expect(200, testStore, done);
	});

	it('GET /cat — Still empty', (done) => {
		supertest
			.get('/cat')
			.auth(process.env.CM_KEY)
			.expect('Content-Type', /json/)
			.expect(200, cat, done);
	});

	it('GET /cm/upsert-container-info — Upsert non-store', (done) => {
		testStore.type = 'something-that-is-not-a-store';

		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testStore)
			.expect('Content-Type', /json/)
			.expect(200, testStore, done);
	});

	it('GET /cat — Still empty', (done) => {
		supertest
			.get('/cat')
			.auth(process.env.CM_KEY)
			.expect('Content-Type', /json/)
			.expect(200, cat, done);
	});

	var expected = null;

	it('GET /cm/upsert-container-info — Upsert store', (done) => {
		testStore.type = 'store';

		expected = JSON.parse(JSON.stringify(testStore));
		expected.catItem = {
			'item-metadata': [
				{
					'rel': 'urn:X-hypercat:rels:isContentType',
					'val': 'application/vnd.hypercat.catalogue+json'
				},
				{
					'rel': 'urn:X-hypercat:rels:hasDescription:en',
					'val': testStore.name
				}
			],
			href: 'https://' + testStore.name + ':8080'
		};

		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testStore)
			.expect('Content-Type', /json/)
			.expect(200, expected, done);
	});

	it('GET /cat — After store registered', (done) => {
		cat.items.push(expected.catItem);

		supertest
			.get('/cat')
			.auth(process.env.CM_KEY)
			.expect('Content-Type', /json/)
			.expect(200, cat, done);
	});

	it('GET /cm/delete-container-info — Deregister store', (done) => {
		supertest
			.post('/cm/delete-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send({ name: testStore.name })
			.expect(200, done);
	});

	it('GET /cat — After store deregistered', (done) => {
		cat.items = [];

		supertest
			.get('/cat')
			.auth(process.env.CM_KEY)
			.expect('Content-Type', /json/)
			.expect(200, cat, done);
	});


});
