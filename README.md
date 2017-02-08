# Databox Arbiter

The Databox Docker container that manages the flow of data by minting tokens and controlling store discovery. This code is not meant to be run on its own except for debug purposes. The live version is automatically pulled from https://databox.amar.io (see [registry catalogue](https://databox.amar.io/v2/_catalog)) as "databox-arbiter" and launched by the [container manager](https://github.com/me-box/databox-container-manager.git).

If you are a Databox app or driver developer, skip to [the relevant API documentation](#container-facing).

Further background info for Databox system devs [here](docs/further-info.md) (*NB: Outdated*).


For debug purposes:

## Installation
	git clone https://github.com/me-box/databox-arbiter.git
	cd databox-arbiter
	npm install --production

## Usage
Make sure you have a private key, certificate, and passphrase included in `certs` as `key.pem`, `cert.pem`, and `passphrase.txt` respectively for HTTPS, by for example running:

	openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 36
	echo "arbitering is life" > certs/passphrase.txt

Then start the program with:

	npm start

Default port is 443 (HTTPS only), but in case of lack of privileges, can be overridden using the PORT environment variable, i.e.:

	PORT=8081 npm start

If not running in a Databox context, set the `DEBUG` environment variable to disable container manager signature verification.

Then interface with https://[host]/ where host is e.g. `localhost`.

## API Endpoints


### ConMan-facing
_(for Databox developers)_

#### /status

##### Description

Method: GET

An endpoint required by the CM to signify if a container needs configuration. Can respond with (active|standby).

##### Response

  - 200: active

#### /cm/upsert-container-info

##### Description

Method: POST

Upserts the record of containers and the extent of their corresponding permissions (default none) maintained by the arbiter.

NB: CM arbiter key MUST be provided as per section 7.1 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf). The arbiter will not accept requests that don't include a key that matches that passed to it in the `CM_KEY` environment variable on launch.

##### Parameters

  - name: Container name (required every time)
  - type: Container type (driver|store|app)
  - key: Container arbiter key

##### Response

###### Success

  - 200: [JSON-formatted updated container record]

###### Error

  - 401:
    - Missing API key (see description above)
    - Unauthorized: Arbiter key invalid

#### /cm/delete-container-info

##### Description

Method: POST

Deletes a containers record by name.

NB: CM arbiter key MUST be provided as per section 7.1 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf). The arbiter will not accept requests that don't include a key that matches that passed to it in the `CM_KEY` environment variable on launch.

##### Parameters

  - name: Container name

##### Response

###### Success

  - 200

###### Error

  - 401:
    - Missing API key (see description above)
    - Unauthorized: Arbiter key invalid
  - 400: Missing parameters

#### /cm/add-container-routes

##### Description

Method: POST

Adds permissible routes to the record of containers maintained by the arbiter for a particular container.

Routes are encoded directly into tokens (as macaroon caveats). Routes are JSON-formatted method-path pairs. The arbiter is indifferent to methods.

	{
		"GET":  "/some/path",
		"POST": [ "/a/b", "/a/c" ],
		"ETC":  "/*"
	}

Paths are JSON-formatted whitelists of accessible endpoints formatted as defined [here](https://github.com/pillarjs/path-to-regexp#parameters) and are testable [here](http://forbeslindesay.github.io/express-route-tester/). They can be a single path string or an array of path strings. More information [here](docs/further-info.md) (*NB: Outdated*).

NB: CM arbiter key MUST be provided as per section 7.1 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf). The arbiter will not accept requests that don't include a key that matches that passed to it in the `CM_KEY` environment variable on launch.

##### Parameters

  - name: Container name
  - target: Target container
  - routes: A routes object

##### Response

###### Success

  - 200: [JSON-formatted container routes after modification]

###### Error

  - 401:
    - Missing API key (see description above)
    - Unauthorized: Arbiter key invalid
  - 400: Missing parameters

#### /cm/delete-container-routes

##### Description

Method: POST

Removes all occurrences of provided routes in the record of containers maintained by the arbiter for a particular container. Note that the provided routes must match those in the arbiter records exactly (wildcards and regular expressions do not apply here; only on validation store-side).

Routes are encoded directly into tokens (as macaroon caveats). Routes are JSON-formatted method-path pairs. The arbiter is indifferent to methods.

	{
		"GET":  "/some/path",
		"POST": [ "/a/b", "/a/c" ],
		"ETC":  "/*"
	}

Paths are JSON-formatted whitelists of accessible endpoints formatted as defined [here](https://github.com/pillarjs/path-to-regexp#parameters) and are testable [here](http://forbeslindesay.github.io/express-route-tester/). They can be a single path string or an array of path strings. More information [here](docs/further-info.md) (*NB: Outdated*).

NB: CM arbiter key MUST be provided as per section 7.1 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf). The arbiter will not accept requests that don't include a key that matches that passed to it in the `CM_KEY` environment variable on launch.

##### Parameters

  - name: Container name
  - target: Target container
  - routes: A routes object

##### Response

###### Success

  - 200: [JSON-formatted container routes after modification]

###### Error

  - 401:
    - Missing API key (see description above)
    - Unauthorized: Arbiter key invalid
  - 400: Missing parameters

### Store-facing
_(for Databox developers)_

#### /store/secret

##### Description

Method: GET

Registers a store allowing the arbiter to mint macaroons for the store, and for the store to verify these macaroons independently.

NB: Container arbiter key (see developer guide) MUST be provided as per section 7.1 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf). Containers without proper authorization will not be able to discover certain items, or will be able to discover them but not access them. In the latter case, they are informed as per section 7.3.1.2 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf).

##### Parameters

##### Response

###### Success

  - 200: [Base64-encoded secret for verifying container macaroons]

###### Error

  - 401: Missing API key (see description above)
  - 401: Invalid API key (see description above)
  - 500: Container type unknown by arbiter
  - 403: Container type [type] cannot use arbiter token minting capabilities as it is not a store type
  - 409: Store shared secret already retrieved
  - 500: Unable to register container (secret generation)


### Container-facing
_(For Databox app and/or driver developers)_

#### /cat

##### Description

Method: GET

Serves a top-level [Hypercat](http://www.hypercat.io/) catalogue.

NB: Container arbiter key (see developer guide) MUST be provided as per section 7.1 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf). Containers without proper authorization will not be able to discover certain items, or will be able to discover them but not access them. In the latter case, they are informed as per section 7.3.1.2 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf).

##### Response

###### Success

  - 200: [JSON-encoded Hypercat catalogue]

###### Error

  - 401: Missing API key (see description above)
  - 409: Container already registered
  - 500: Unable to register container (secret generation)

#### /token

##### Description

Method: POST

Provides store tokens for containers.

NB: Container arbiter key (see developer guide) MUST be provided as per section 7.1 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf). Containers without proper authorization will not be able to discover certain items, or will be able to discover them but not access them. In the latter case, they are informed as per section 7.3.1.2 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf).

##### Parameters

  - target: The unique name of the target container that will verify the provided macaroon

##### Response

###### Success

  - 200: [Serialzed macaroon]

###### Error

  - 401: Missing API key (see description above)
  - 401: Invalid API key
  - 400: Missing parameters
  - 400: Target [target] has not been approved for arbitering
  - 400: Target [target] has not registered itself for arbitering
