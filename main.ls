require! { express, 'body-parser', request }

express!

  # TODO: Check
  ..enable 'trust proxy'

  ..use body-parser.urlencoded extended: false

  ..post '/:driver/*' (req, res) !->
    console.log "Driver: #{req.params.driver}, IP: #{req.ip}, Token: #{req.body.token}"
    request.get "http://#{req.params.driver}:8080/#{req.params[0]}" .pipe res

  ..listen 7999
