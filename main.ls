require! { express, 'body-parser', request, crypto, 'macaroons.js' }

# TODO: Remove when macaroons.js accepts my pull request
const MACAROON_SUGGESTED_SECRET_LENGTH = macaroons.MacaroonsConstants?.MACAROON_SUGGESTED_SECRET_LENGTH or 32

const CM_PUB_KEY = process.env.CM_PUB_KEY or ''

console.log CM_PUB_KEY

secrets = {}

express!

  # TODO: Check
  ..enable 'trust proxy'

  ..use body-parser.urlencoded extended: false

  ..post \/update (req, res) !->



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
