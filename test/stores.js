process.env.CM_KEY = 'chrC9e52tR5ljd+02Shg6khojHNUpAhaqAplQ1jFgCw='

var supertest = require('supertest')(require('../main.js'));
var assert = require('assert');

describe('Test store endpoints', function() {
	var storeKey = '8MDlgBNXfmklmQVTrJxfIwAjo8j5nIrE8aeFVIdn6Kg=';

	it('GET /store/secret — No API key', (done) => {
		supertest
			.get('/store/secret')
			.send()
			.expect(401, 'Missing API key', done);
	});

	var testStore = {};

	it('POST /cm/upsert-container-info — Add store', (done) => {
		testStore.name = 'test-store';

		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testStore)
			.expect('Content-Type', /json/)
			.expect(200, testStore, done);
	});

	it('GET /store/secret — Unknown API key (should never happen)', (done) => {
		supertest
			.get('/store/secret')
			.auth(storeKey)
			.expect(401, 'Invalid API key', done);
	});

	it('POST /cm/upsert-container-info — Update store key', (done) => {
		testStore.key = storeKey;

		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testStore)
			.expect('Content-Type', /json/)
			.expect(200, testStore, done);
	});

	it('GET /store/secret — Container type unknown (should never happen)', (done) => {
		supertest
			.get('/store/secret')
			.auth(storeKey)
			.expect(500, 'Container type unknown by arbiter', done);
	});

	it('POST /cm/upsert-container-info — Update container type to non-store', (done) => {
		testStore.type = 'app';

		supertest
			.post('/cm/upsert-container-info')
			.auth(process.env.CM_KEY)
			.set('Content-Type', 'application/json')
			.send(testStore)
			.expect('Content-Type', /json/)
			.expect(200, testStore, done);
	});

	it('GET /store/secret — Container type non-store', (done) => {
		supertest
			.get('/store/secret')
			.auth(storeKey)
			.expect(403, 'Container type "' + testStore.type + '" cannot use arbiter token minting capabilities as it is not a store type', done);
	});

	it('POST /cm/upsert-container-info — Update container type to store', (done) => {
		testStore.type = 'store';

		var expected = JSON.parse(JSON.stringify(testStore));
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

	it('GET /store/secret — Get secret', (done) => {
		supertest
			.get('/store/secret')
			.auth(storeKey)
			.set('Content-Type', 'application/json')
			.send(testStore)
			.expect(function (res) {
				// TODO: Error handling
				res.text = Buffer.from(res.text, 'base64').length === 32;
			})
			.expect(200, true, done);
	});
});
