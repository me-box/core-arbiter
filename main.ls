require! { express, 'body-parser', request, crypto, 'macaroons.js', 'ursa-purejs': ursa }

const PORT = process.env.PORT or 8080
const CM_PUB_KEY = process.env.CM_PUB_KEY or ''

secrets = {}
containers = {}

express!

  # TODO: Check
  ..enable 'trust proxy'

  ..use body-parser.urlencoded extended: false

  ..get \/status (req, res) !-> res.send \active

  ..post \/update do ->
    pub = if CM_PUB_KEY then ursa.create-public-key CM_PUB_KEY, \base64

    unless pub?
      console.warn 'Container manager public key was not received; all update requests will be rejected!'

    screen = (body) ->
      resolve, reject <-! new Promise!

      unless body? and body.data? and body.sig?
        reject 'Missing parameters'
        return

      unless pub.hash-and-verify \md5 body.data, new Buffer body.sig, \base64
        reject 'Signature verification failed'
        return

      # TODO: Handle failed parse maybe
      # TODO: Validate data
      body.data |> JSON.parse |> resolve

    (req, res) !->
      unless pub?
        console.warn 'Update request rejected from' req.ip
        res.status 403 .send 'Update request rejected; unable to verify data due to missing public key'
        return

      data <-! screen req.body
        .catch (reason) !->
          console.log "Update request rejected: #reason"
          res.status 403 .send "Update request rejected: #reason"
        # TODO: This is wrong...
        .then

      # TODO: Store in a DB maybe? Probably not.
      unless data.name of containers then containers[data.name] = {}
      containers[data.name] <<<< data

      containers[data.name] |> JSON.stringify |> res.send

  ..post \/register (req, res) !->
    unless req.body.token?
      res.status 400 .send 'Missing container token'
      return

    if req.body.token of secrets
      res.status 409 .send 'Container already registered'
      return

    err, buffer <-! crypto.random-bytes macaroons.MacaroonsConstants.MACAROON_SUGGESTED_SECRET_LENGTH

    if err?
      res.status 500 .send 'Unable to register container (secret generation)'
      return

    secrets[req.body.token] = buffer
    buffer |> (.to-string \base64) |> res.send

  ..post \/macaroon (req, res) !->
    unless req.body.token? and req.body.target?
      res.status 400 .send 'Missing parameters'
      return

    unless req.body.target of containers
      res.status 400 .send "Target #{req.body.target} has not been approved for arbitering"
      return

    target-token = containers[req.body.target].token

    unless target-token of secrets
      res.status 400 .send "Target #{req.body.target} has not registered itself for arbitering"
      return

    # TODO: Check permissions here!

    err, buffer <-! crypto.random-bytes 32
    new macaroons.MacaroonsBuilder "http://arbiter:#PORT", secrets[target-token], buffer.to-string \base64
      .add_first_party_caveat "target = #{req.body.target}"
      # TODO: Construct macaroon based on permissions, not just a generic one
      .get-macaroon!
      .serialize!
      |> res.send

  /*
  ..post '/:driver/*' (req, res) !->
    console.log "Driver: #{req.params.driver}, IP: #{req.ip}, Token: #{req.body.token}"
    request.get "http://#{req.params.driver}:8080/#{req.params[0]}" .pipe res
  */

  ..listen PORT
