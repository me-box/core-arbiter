# Databox Arbiter

The Databox Docker container that manages the flow of data by minting tokens and controlling store discovery. This code is not meant to be run on its own except for debug purposes. The live version is automatically pulled from https://databox.amar.io (see [registry catalogue](https://databox.amar.io/v2/_catalog)) as "databox-arbiter" and launched by the [container manager](https://github.com/me-box/databox-container-manager.git).

If you are a Databox app or driver developer, skip to [the relevant API documentation](#container-facing).

Further background info for Databox system devs [here](docs/further-info.md) (*NB: Outdated*).


For debug purposes:

## Installation
	git clone https://github.com/me-box/databox-arbiter.git
	cd databox-arbiter
	npm install

## Usage

This code should not be run as a standalone app, but rather in a Databox context. Unit tests to make sure it will work in that context can be run with:

	npm test

Default port is 8080 (HTTPS only), but in case of lack of privileges, can be overridden using the PORT environment variable, i.e.:

	PORT=8081 npm start

## API Endpoints

All request bodies should be `application/json`.

### CM-facing
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

#### /cm/grant-container-permissions

##### Description

Method: POST

Adds permissions to the record of containers maintained by the arbiter for a particular route.

Routes are encoded into tokens (as macaroon caveats). Routes are made up of a target container, an API path, and an HTTP method. The arbiter is indifferent to methods, but for the majority of APIs, `GET` requests map to read operations, and `POST` requests map to write operations.

Paths are JSON-formatted whitelists of accessible endpoints formatted as defined [here](https://github.com/pillarjs/path-to-regexp#parameters) and are testable [here](http://forbeslindesay.github.io/express-route-tester/). More information [here](https://github.com/me-box/admin/blob/master/specs/token-auth.md#path--datasourceapi).

NB: CM arbiter key MUST be provided as per section 7.1 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf). The arbiter will not accept requests that don't include a key that matches that passed to it in the `CM_KEY` environment variable on launch.

##### Parameters

  - name: Container name
  - route:
    - target: Target container hostname
    - path:   API path
    - method: HTTP method
  - caveats: String array of route-specific caveats (all optional, see [here](https://github.com/me-box/admin/blob/master/specs/token-auth.md) for explanations).

##### Response

###### Success

  - 200: [JSON array of route caveats after modification]

###### Error

  - 401:
    - Missing API key (see description above)
    - Unauthorized: Arbiter key invalid
  - 400: Missing parameters

#### /cm/revoke-container-permissions

##### Description

Method: POST

Does the opposite of `/cm/grant-container-permissions`. Note that the provided routes must match those in the arbiter records exactly (wildcards and regular expressions do not apply here; only on validation store-side).

NB: CM arbiter key MUST be provided as per section 7.1 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf). The arbiter will not accept requests that don't include a key that matches that passed to it in the `CM_KEY` environment variable on launch.

##### Parameters

  - name: Container name
  - route:
    - target: Target container hostname
    - path:   API path
    - method: HTTP method
  - caveats: String array of route-specific caveats to delete. If none specified, all permissions for this route are completely revoked.

##### Response

###### Success

  - 200:
    - [JSON array of route caveats after modification]
    - null (if all permissions are revoked)

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

#### /token

##### Description

Method: POST

Provides store tokens for containers.

NB: Container arbiter key (see developer guide) MUST be provided as per section 7.1 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf). Containers without proper authorization will not be able to discover certain items, or will be able to discover them but not access them. In the latter case, they are informed as per section 7.3.1.2 of the [Hypercat 3.0 specs](http://shop.bsigroup.com/upload/276778/PAS_212.pdf).

##### Parameters

  - target: The unique hostname of the target container that will verify the provided macaroon
  - path:   API path for which the token should be minted for
  - method: HTTP method for which the token should be minted for

##### Response

###### Success

  - 200: [Serialzed macaroon]

###### Error

  - 401:
    - Missing API key (see description above)
    - Invalid API key
    - Insufficient route permissions
  - 400:
    - Missing parameters
    - Target [target] has not been approved for arbitering
    - Target [target] has not registered itself for arbitering
