# Databox Arbiter

The Databox Docker container that manages the flow of data. This code is not meant to be run on its own except for debug purposes. The live version is automatically pulled from https://amar.io:5000 as "databox-arbiter" and launched by the [container manager](https://github.com/me-box/databox-container-manager.git).

For debug purposes:

## Installation
	git clone https://github.com/me-box/databox-arbiter.git
	cd databox-arbiter
	npm install --production

## Usage
	npm start

Default port is 8080, but can be overridden using the PORT environment variable, i.e.:

	PORT=8081 npm start

Then interface with http://localhost:8080/.

## API Endpoints

### ConMan-facing

#### /status

##### Description

Method: GET

An endpoint required by the CM to signify if a container needs configuration. Can respond with (active|standby).

##### Response

  - 200: active

#### /update

##### Description

Method: POST

Updates the record of containers and the extent of their corresponding permissions (default none) maintained by the arbiter.

##### Parameters

  - data: A JSON string with the following properties:
    - name: Container name
    - token: Container token
    - type: Container type (driver|store|app)
  - sig: a base 64 encoded signature, verified by hashing *data* using md5 and decrypting the result using the cm public key (provided as the environment variable `CM_PUB_KEY`).

##### Response

###### Success

  - 200: [JSON-formatted updated container record]

###### Error

  - 403: Update request rejected; [reason]
    - Unable to verify data due to missing public key
    - Missing parameters
    - Signature verification failed

### Container-facing

#### /register

##### Description

Method: POST

Registers a container allowing the arbiter to mint macaroons for the container, and for the container to verify these macaroons independently.

##### Parameters

  - token: The token assigned to a container by the CM

##### Response

###### Success

  - 200: [Base64-encoded secret for verifying container macaroons]

###### Error

  - 400: Missing container token
  - 409: Container already registered
  - 500: Unable to register container (secret generation)

#### /macaroon

##### Description

Method: POST

Provides macaroons for containers.

##### Parameters

  - token: The token assigned to a container by the CM
  - target: The unique name of the target container that will verify the provided macaroon

##### Response

###### Success

  - 200: [Serialzed macaroon]

###### Error

  - 400: Missing parameters
  - 400: Target [target] has not been approved for arbitering
  - 400: Target [target] has not registered itself for arbitering

#### /:driver/*

##### Description

Method: POST

**Warning: Deprecated**

Forwards request to a specified driver.

##### URL Parameters

  - driver: The unique name of the target driver

##### Body Parameters

  - token: The token assigned to a container by the CM

##### Response

  - Whatever the specified driver responds


## Further information

### Macaroons

Macaroons are bearer tokens, similar to signed cookies, to which one can add verifiable caveats. See the sidebar [here](http://macaroons.io/) for more information.

One of the main jobs of the arbiter is to mint these macaroons, and pass them on to drivers or apps. Either can then use these macaroons to query stores (to write to them or read from them respectively) with which the store can verify that all caveats are satisfied.

Caveats include:
  - **target = [name]** - The target store where [name] is its unique name
  - **time < [timestamp]** - A timestamp that to give the macaroon an expiry date (not yet implemented)
  - **path = [path]** - A JSON-formatted whitelist of accessible endpoints formatted as defined [here](https://github.com/pillarjs/path-to-regexp#parameters) and are testable [here](http://forbeslindesay.github.io/express-route-tester/). Can be a single path string or an array of path strings. This caveat can be stacked to narrow down allowed paths more and more.
  - TBA: Caveats for full permissions and granularity restrictions.


### Arbiter Flow

#### Combined Flow

![A combined diagram of Databox arbiter flow](doc/res/flow.png "Combined Flow Diagram")

##### Part A (blue)

1. Once the container manager (CM -- not a container itself) is launched, it launches the arbiter container after pulling any updates from the registry. On launching the arbiter, it also supplies it with a public key as an environment variable such that the arbiter can confirm if privileged commands are indeed coming from the CM.
2. A container (driver or app) is pulled from the registry along with its manifest.
3. The CM generates unique tokens for every container it will launch, and informs the arbiter of these tokens and the extent of corresponding containers' permissions.

##### Part B (red)

1. Before launching a driver, the CM launches one or more store containers to be written to by this driver -- as specified in the driver's manifest -- and passes the previously generated tokens to these stores.
2. The stores register themselves with the arbiter using their tokens.
3. The arbiter generates a secret key for every store, associates it with store tokens, and responds to the request with it. Using this key, a store can now verify macaroons minted by the arbiter and given to apps.
4. The CM launches a driver container and provides it with a token.
5. The driver uses this token to request write access to its associated stores. This process may need to be repeated periodically as macaroons expire.
6. On checking the token against the record created in part A step 3, the arbiter generates macaroons that allow writing to corresponding stores.
7. The driver can now use these macaroons to directly write to its stores (which are accessed by hostname defined by a driver name and names specified in a driver manifest).

##### Part C (green)

1. The CM launches an app container and provides it with a token.
2. The app uses this token to request read access to one or more stores (see Part B). This process may need to be repeated periodically as macaroons expire.
3. On checking the token against the record created in part A step 3, the arbiter generates macaroons that allow reading from corresponding stores. Granularity restrictions or store-specific permissions are encoded as caveats into the macaroons.
4. The app can now use these macaroons to directly query the stores (which are accessed by hostname defined by a driver name and names specified in a driver manifest).
5. A store, on verifying a macaroon using the secret key supplied to it by the arbiter (see part B step 3) can respond to the app with the data requested.


#### Driver-Centric Flow

![A driver-centric diagram of Databox arbiter flow](doc/res/driver-view.png "Driver-Centric Flow Diagram")

1. Once the container manager (CM -- not a container itself) is launched, it launches the arbiter container after pulling any updates from the registry. On launching the arbiter, it also supplies it with a public key as an environment variable such that the arbiter can confirm if privileged commands are indeed coming from the CM.
2. A driver container is pulled from the registry along with its manifest.
3. The CM generates unique IDs for every container it will launch, and informs the arbiter of these IDs and the extent of corresponding containers' permissions.
4. The CM launches one or more store containers to be written to by this driver -- as specified in the driver's manifest -- and passes the previously generated tokens to these stores.
5. The stores register themselves with the arbiter using their individual tokens.
6. The arbiter generates a secret key for every store, associates it with store tokens, and responds to the request with it. Using this key, a store can now verify macaroons minted by the arbiter and given to apps.
7. The CM launches a driver container and provides it with a token.
8. The driver uses this token to request write access to its associated stores. This process may need to be repeated periodically as macaroons expire.
9. On checking the token against the record created in (3), the arbiter generates macaroons that allow writing to corresponding stores.
10. The driver can now use these macaroons to directly write to its stores (which are accessed by hostname defined by a driver name and names specified in a driver manifest).


#### App-Centric Flow

![An app-centric diagram of Databox arbiter flow](doc/res/app-view.png "App-Centric Flow Diagram")

1. Once the container manager (CM -- not a container itself) is launched, it launches the arbiter container after pulling any updates from the registry. On launching the arbiter, it also supplies it with a public key as an environment variable such that the arbiter can confirm if privileged commands are indeed coming from the CM.
2. An app container is pulled from the registry along with its manifest.
3. The CM generates unique IDs for every container it will launch, and informs the arbiter of these IDs and the extent of corresponding containers' permissions.
4. The CM launches an app container and provides it with a token.
5. The app uses this token to request read access to one or more stores (see DCF). This process may need to be repeated periodically as macaroons expire.
6. On checking the token against the record created in (3), the arbiter generates macaroons that allow reading from corresponding stores. Granularity restrictions or store-specific permissions are encoded as caveats into the macaroons.
7. The app can now use these macaroons to directly query the stores (which are accessed by hostname defined by a driver name and names specified in a driver manifest).
8. A store, on verifying a macaroon using the secret key supplied to it by the arbiter (see (6) in DCF) can respond to the app with the data requested.
