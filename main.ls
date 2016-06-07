require! { express, 'body-parser', request, crypto, 'macaroons.js', 'ursa-purejs': ursa }

# TODO: Remove when macaroons.js accepts my pull request
const MACAROON_SUGGESTED_SECRET_LENGTH = macaroons.MacaroonsConstants?.MACAROON_SUGGESTED_SECRET_LENGTH or 32

const CM_PUB_KEY = process.env.CM_PUB_KEY or ''

secrets = {}

express!

  # TODO: Check
  ..enable 'trust proxy'

  ..use body-parser.urlencoded extended: false

  ..post \/update do ->
    pub = if CM_PUB_KEY then ursa.create-public-key CM_PUB_KEY, \base64

    unless pub?
      console.warn 'Container manager public key was not received; all update requests will be rejected!'

    screen = (body) ->
      resolve, reject <-! new Promise!

      unless body? and body.data? and body.sig?
        reject 'Missing data'
        return

      unless pub.hash-and-verify \md5 body.data, body.sig
        reject 'Signature verification failed'
        return

      # TODO: Handle failed parse maybe
      body.data |> JSON.parse |> resolve

    (req, res) !->
      unless pub?
        console.warn 'Update request rejected from' req.ip
        res.status 403 .send 'Update request rejected; unable to verify data due to missing public key'
        return

      data <-! screen req.body
        .catch (reason) !->
          res.status 403 .send "Update request rejected: #reason"
        .then

      console.log data

  ..post \/register (req, res) !->
    unless req.body.store-id?
      res.status 400 .send 'Missing storeId parameter'
      return

    if req.body.store-id of secrets
      res.status 409 .send 'Store already registered'
      return

    err, buffer <-! crypto.random-bytes MACAROON_SUGGESTED_SECRET_LENGTH

    if err?
      res.status 500 .send 'Unable to register store (secret generation)'
      return

    buffer.to-string \hex
      secrets[req.body.store-id] = ..
      .. |> res.send

  ..post '/:driver/*' (req, res) !->
    console.log "Driver: #{req.params.driver}, IP: #{req.ip}, Token: #{req.body.token}"
    request.get "http://#{req.params.driver}:8080/#{req.params[0]}" .pipe res

  ..listen (process.env.PORT or 8080)
