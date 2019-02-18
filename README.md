### Introduction

A server that can mint tokens to be used by [ZestDB](https://me-box.github.io/zestdb/).


### Basic usage

We will demonstrate the sequence required for generating a token capable of being used by a Databox App that wishes to get data from a Databox store.

You can run a server and test client using [Docker](https://www.docker.com/). Each command supports --help to get a list of parameters.

#### starting server

```bash
$ docker run -p 4444:4444 -p 4445:4445 -d --name arbiter --rm jptmoore/arbiter /app/zest/server.exe --secret-key-file example-server-key --token-key-file example-token-key
```

#### running client to register an App with arbiter

```bash
$ docker run --network host -it jptmoore/zestdb /app/zest/client.exe --server-key 'vl6wu0A@XP?}Or/&BR#LSxn>A+}L)p44/W[wXL3<' --path '/cm/upsert-container-info' --mode post --payload '{"name": "foo", "type": "app", "key": "foosecret"}' --token secret --request-endpoint tcp://0.0.0.0:4444
```

This will register an App called 'foo' with the arbiter that has an access key of 'foosecret'.

#### running client to register a Store with arbiter

```bash
$ docker run --network host -it jptmoore/zestdb /app/zest/client.exe --server-key 'vl6wu0A@XP?}Or/&BR#LSxn>A+}L)p44/W[wXL3<' --path '/cm/upsert-container-info' --mode post --payload '{"name": "bar", "type": "store", "key": "barsecret"}' --token secret --request-endpoint tcp://0.0.0.0:4444
```

This will register a Store called 'bar' with the arbiter that has an access key of 'barsecret'.

#### running client to grant permissions to an App

```bash
$ docker run --network host -it jptmoore/zestdb /app/zest/client.exe --server-key 'vl6wu0A@XP?}Or/&BR#LSxn>A+}L)p44/W[wXL3<' --path '/cm/grant-container-permissions' --mode post --payload '{"name": "foo", "caveats": [], "route": {"method": "GET", "path": "/ts/sensor/*", "target": "bar"}}' --token secret --request-endpoint tcp://0.0.0.0:4444
```

This will grant permissions to an App called 'foo' so that it is able to 'GET' data from a path that begins with '/ts/sensor' on a store called 'bar'.

#### running client to get token secret for Store

```bash
$ docker run --network host -it jptmoore/zestdb /app/zest/client.exe --server-key 'vl6wu0A@XP?}Or/&BR#LSxn>A+}L)p44/W[wXL3<' --path '/store/secret' --mode get --identity bar --token barsecret --request-endpoint tcp://0.0.0.0:4444
```

This will allow a Store called 'bar' to retrieve a secret used to verify tokens from App's and Drivers. The 'identity' flag is used here to set the 'uri_host' option in the Zest protocol. Without this flag the Unix hostname will be supplied in the GET request.

#### running client to generate token for App

```bash
$ docker run --network host -it jptmoore/zestdb /app/zest/client.exe --server-key 'vl6wu0A@XP?}Or/&BR#LSxn>A+}L)p44/W[wXL3<' --path '/token' --mode post --payload '{"method": "GET", "caveats": [], "path": "/ts/sensor/latest", "target": "bar"}' --identity foo --token foosecret --request-endpoint tcp://0.0.0.0:4444
```

This will generate an access token for an App called 'foo' that has permissions to be spent by a Store called 'bar' provided the exact permissions have been previously granted and a secret has also be generated. The 'identity' flag is used here to set the 'uri_host' option in the Zest protocol. Without this flag the Unix hostname will be supplied in the POST request.


### Logging

Logging takes place over the middleware. There two ways to monitor data: observing data or observing meta-data (audit mode).

#### Data

To receive a copy of any data posted to specific paths (including wildcard paths) you can do something like the following:

```bash
$ docker run --network host -it jptmoore/zestdb /app/zest/client.exe --server-key 'vl6wu0A@XP?}Or/&BR#LSxn>A+}L)p44/W[wXL3<' --path '/*' --mode observe --request-endpoint 'tcp://0.0.0.0:4444' --router-endpoint 'tcp://0.0.0.0:4445' --observe-mode data --token secret
```

This will subscribe to any path and produce output such as:

```
#timestamp #uri-path #content-format #data
1530865659656 /cm/upsert-container-info json {"name": "foo", "type": "app", "key": "foosecret"}
1530865661634 /cm/grant-container-permissions json {"name": "foo", "caveats": [], "route": {"method": "GET", "path": "/ts/sensor", "target": "bar"}}
```

#### Meta-data

To receive a copy of the meta-data of any request you need to set the 'observe-mode' flag to 'audit'. For example:

```bash
$ docker run --network host -it jptmoore/zestdb /app/zest/client.exe --server-key 'vl6wu0A@XP?}Or/&BR#LSxn>A+}L)p44/W[wXL3<' --path '/*' --mode observe --request-endpoint 'tcp://0.0.0.0:4444' --router-endpoint 'tcp://0.0.0.0:4445' --observe-mode audit --token secret
```

This will subscribe to any path and produce output such as:

```
#timestamp #server-name #client-name #method #uri-path #response-code
1530882230648 zedstar Johns-MacBook-Pro-3.local POST /cm/upsert-container-info 69
1530882232664 zedstar Johns-MacBook-Pro-3.local POST /cm/grant-container-permissions 69
```

### API

#### Status request
    URL: /status
    Method: GET
    Parameters:
    Notes: Check the server is up
    
    
#### Register with arbiter
    URL: /cm/upsert-container-info
    Method: POST
    Parameters: JSON dictionary of 'name', 'type' and 'target'
    Notes: Register an app/driver/store with arbiter    
     

#### Remove from arbiter
    URL: /cm/delete-container-info
    Method: POST
    Parameters: JSON dictionary of 'name'
    Notes: Remove app/driver/store from arbiter


#### Grant permissions
    URL: /cm/grant-container-permissions
    Method: POST
    Parameters: JSON dictionary of 'name', 'route' and 'caveats' where route is dictionary of 'method', 'path' and 'target' and 'caveats' is an array which currently supports an observe restriction on a GET method. 
    Notes: Add permissions to an existing app or driver
    

#### Revoke permissions
    URL: /cm/revoke-container-permissions
    Method: POST
    Parameters: JSON dictionary of 'name', 'route' and 'caveats' where route is dictionary of 'method', 'path' and 'target' and 'caveats' is an array which currently supports an observe restriction on a GET method. 
    Notes: Add permissions to an existing app or driver    
         
#### Generate token secret
    URL: /store/secret
    Method: GET
    Parameters: 
    Notes: generates a secret that is used by a store for verifying access tokens 
    

#### Generate token
    URL: /token
    Method: POST
    Parameters: JSON dictionary of 'method', 'path', 'target' and 'caveats' where 'caveats' is an array which currently supports an observe restriction on a GET method. 
    Notes: generates an access token for an app/driver to be spent at a store
    
    
#### Hypercat
    URL: /cat
    Method: GET
    Parameters: 
    Notes: retrieves the hypercat
