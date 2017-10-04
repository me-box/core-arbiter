
## Further information
(This is not an up-to-date document)
### Macaroons

Macaroons are bearer tokens, similar to signed cookies, to which one can add verifiable caveats. See the sidebar [here](http://macaroons.io/) for more information.

One of the main jobs of the arbiter is to mint these macaroons, and pass them on to drivers or apps. Either can then use these macaroons to query stores (to write to them or read from them respectively) with which the store can verify that all caveats are satisfied.

Caveats include:
  - **target = [name]** - The target store where [name] is its unique name
  - **time < [timestamp]** - A timestamp that to give the macaroon an expiry date (not yet implemented)
  - **path = [path]** - A JSON-formatted whitelist of accessible endpoints formatted as defined [here](https://github.com/pillarjs/path-to-regexp#parameters) and are testable [here](http://forbeslindesay.github.io/express-route-tester/). Can be a single path string or an array of path strings. This caveat can be stacked to narrow down allowed paths more and more.
  - TBA: Caveats for full permissions and granularity restrictions.


### Arbiter Flow

> Warning: Potentially outdated!

#### Combined Flow

![A combined diagram of Databox arbiter flow](res/flow.png "Combined Flow Diagram")

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

![A driver-centric diagram of Databox arbiter flow](res/driver-view.png "Driver-Centric Flow Diagram")

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

![An app-centric diagram of Databox arbiter flow](res/app-view.png "App-Centric Flow Diagram")

1. Once the container manager (CM -- not a container itself) is launched, it launches the arbiter container after pulling any updates from the registry. On launching the arbiter, it also supplies it with a public key as an environment variable such that the arbiter can confirm if privileged commands are indeed coming from the CM.
2. An app container is pulled from the registry along with its manifest.
3. The CM generates unique IDs for every container it will launch, and informs the arbiter of these IDs and the extent of corresponding containers' permissions.
4. The CM launches an app container and provides it with a token.
5. The app uses this token to request read access to one or more stores (see DCF). This process may need to be repeated periodically as macaroons expire.
6. On checking the token against the record created in (3), the arbiter generates macaroons that allow reading from corresponding stores. Granularity restrictions or store-specific permissions are encoded as caveats into the macaroons.
7. The app can now use these macaroons to directly query the stores (which are accessed by hostname defined by a driver name and names specified in a driver manifest).
8. A store, on verifying a macaroon using the secret key supplied to it by the arbiter (see (6) in DCF) can respond to the app with the data requested.
